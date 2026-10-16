using System.Net;
using System.Net.Sockets;

namespace MyThorneAI.Ats.Api.Infrastructure;

// Outbound webhooks go to addresses an admin typed. Checking the URL when it is saved isn't enough (a
// public name can resolve to a private address, or redirect to one), so the connection itself is checked.
public static class SsrfGuard
{
    public static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
            address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
            return false;
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return !(address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.IsIPv6UniqueLocal || address.IsIPv6Multicast);
        var b = address.GetAddressBytes();
        return !(
            b[0] is 0 or 10 or 127
            || (b[0] == 100 && b[1] is >= 64 and <= 127) // carrier-grade NAT
            || (b[0] == 169 && b[1] == 254) // link-local, including cloud metadata
            || (b[0] == 172 && b[1] is >= 16 and <= 31)
            || (b[0] == 192 && b[1] == 168)
            || b[0] >= 224
        );
    }

    // Resolves the host, refuses if any address is non-public, and connects to the address it checked.
    public static SocketsHttpHandler Handler(bool allowLoopback) =>
        new()
        {
            AllowAutoRedirect = false,
            ConnectCallback = async (context, ct) =>
            {
                var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, ct);
                var allowed = addresses
                    .Where(a => IsPublic(a) || (allowLoopback && IPAddress.IsLoopback(a)))
                    .ToArray();
                if (allowed.Length == 0 || (allowed.Length != addresses.Length && !allowLoopback))
                    throw new HttpRequestException("That address isn't a public one, so the request was blocked.");
                var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try
                {
                    await socket.ConnectAsync(allowed, context.DnsEndPoint.Port, ct);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            },
        };
}
