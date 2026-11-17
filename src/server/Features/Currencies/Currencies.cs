using System.Globalization;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>How a currency is written: its ISO 4217 code, name, symbol and number of decimals.</summary>
public sealed record CurrencyInfo(string Code, string Name, string Symbol, int Decimals = 2);

/// <summary>
/// The built-in currency catalog: every country currency in ISO 4217, the common ones first. The
/// baseline seed copies it into the workspace, where an admin picks the supported ones. Rates
/// exist for the currencies the rate source publishes; the others show amounts as posted.
/// Formatting falls back to it when a code is not in the database.
/// </summary>
public static class Currencies
{
    public const string DefaultBase = "USD";

    /// <summary>Supported from the start, in this order.</summary>
    public static readonly string[] DefaultSupported = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

    public static readonly CurrencyInfo[] Catalog =
    [
        new("USD", "US dollar", "$"),
        new("EUR", "Euro", "€"),
        new("GBP", "Pound sterling", "£"),
        new("CAD", "Canadian dollar", "CA$"),
        new("AUD", "Australian dollar", "A$"),
        new("NZD", "New Zealand dollar", "NZ$"),
        new("INR", "Indian rupee", "₹"),
        new("JPY", "Japanese yen", "¥", 0),
        new("CNY", "Chinese yuan", "CN¥"),
        new("CHF", "Swiss franc", "CHF"),
        new("SEK", "Swedish krona", "kr"),
        new("NOK", "Norwegian krone", "kr"),
        new("DKK", "Danish krone", "kr"),
        new("PLN", "Polish złoty", "zł"),
        new("CZK", "Czech koruna", "Kč"),
        new("HUF", "Hungarian forint", "Ft"),
        new("RON", "Romanian leu", "lei"),
        new("BGN", "Bulgarian lev", "лв"),
        new("TRY", "Turkish lira", "₺"),
        new("ILS", "Israeli new shekel", "₪"),
        new("ZAR", "South African rand", "R"),
        new("BRL", "Brazilian real", "R$"),
        new("MXN", "Mexican peso", "MX$"),
        new("SGD", "Singapore dollar", "S$"),
        new("HKD", "Hong Kong dollar", "HK$"),
        new("KRW", "South Korean won", "₩", 0),
        new("IDR", "Indonesian rupiah", "Rp"),
        new("MYR", "Malaysian ringgit", "RM"),
        new("PHP", "Philippine peso", "₱"),
        new("THB", "Thai baht", "฿"),
        new("AED", "UAE dirham", "د.إ"),
        new("AFN", "Afghan afghani", "؋"),
        new("ALL", "Albanian lek", "L"),
        new("AMD", "Armenian dram", "֏"),
        new("ANG", "Netherlands Antillean guilder", "ƒ"),
        new("AOA", "Angolan kwanza", "Kz"),
        new("ARS", "Argentine peso", "AR$"),
        new("AWG", "Aruban florin", "ƒ"),
        new("AZN", "Azerbaijani manat", "₼"),
        new("BAM", "Bosnia and Herzegovina convertible mark", "KM"),
        new("BBD", "Barbadian dollar", "Bds$"),
        new("BDT", "Bangladeshi taka", "৳"),
        new("BHD", "Bahraini dinar", "BD", 3),
        new("BIF", "Burundian franc", "FBu", 0),
        new("BMD", "Bermudian dollar", "BD$"),
        new("BND", "Brunei dollar", "B$"),
        new("BOB", "Bolivian boliviano", "Bs"),
        new("BSD", "Bahamian dollar", "B$"),
        new("BTN", "Bhutanese ngultrum", "Nu."),
        new("BWP", "Botswana pula", "P"),
        new("BYN", "Belarusian ruble", "Br"),
        new("BZD", "Belize dollar", "BZ$"),
        new("CDF", "Congolese franc", "FC"),
        new("CLP", "Chilean peso", "CLP$", 0),
        new("COP", "Colombian peso", "COL$"),
        new("CRC", "Costa Rican colón", "₡"),
        new("CUP", "Cuban peso", "CU$"),
        new("CVE", "Cape Verdean escudo", "Esc"),
        new("DJF", "Djiboutian franc", "Fdj", 0),
        new("DOP", "Dominican peso", "RD$"),
        new("DZD", "Algerian dinar", "DA"),
        new("EGP", "Egyptian pound", "E£"),
        new("ERN", "Eritrean nakfa", "Nfk"),
        new("ETB", "Ethiopian birr", "Br"),
        new("FJD", "Fijian dollar", "FJ$"),
        new("FKP", "Falkland Islands pound", "FK£"),
        new("GEL", "Georgian lari", "₾"),
        new("GHS", "Ghanaian cedi", "GH₵"),
        new("GIP", "Gibraltar pound", "GI£"),
        new("GMD", "Gambian dalasi", "D"),
        new("GNF", "Guinean franc", "FG", 0),
        new("GTQ", "Guatemalan quetzal", "Q"),
        new("GYD", "Guyanese dollar", "GY$"),
        new("HNL", "Honduran lempira", "L"),
        new("HTG", "Haitian gourde", "G"),
        new("IQD", "Iraqi dinar", "IQD", 3),
        new("IRR", "Iranian rial", "IRR"),
        new("ISK", "Icelandic króna", "kr", 0),
        new("JMD", "Jamaican dollar", "J$"),
        new("JOD", "Jordanian dinar", "JD", 3),
        new("KES", "Kenyan shilling", "KSh"),
        new("KGS", "Kyrgyzstani som", "KGS"),
        new("KHR", "Cambodian riel", "៛"),
        new("KMF", "Comorian franc", "CF", 0),
        new("KPW", "North Korean won", "KPW"),
        new("KWD", "Kuwaiti dinar", "KD", 3),
        new("KYD", "Cayman Islands dollar", "CI$"),
        new("KZT", "Kazakhstani tenge", "₸"),
        new("LAK", "Lao kip", "₭"),
        new("LBP", "Lebanese pound", "L£"),
        new("LKR", "Sri Lankan rupee", "Rs"),
        new("LRD", "Liberian dollar", "L$"),
        new("LSL", "Lesotho loti", "L"),
        new("LYD", "Libyan dinar", "LD", 3),
        new("MAD", "Moroccan dirham", "MAD"),
        new("MDL", "Moldovan leu", "MDL"),
        new("MGA", "Malagasy ariary", "Ar"),
        new("MKD", "Macedonian denar", "ден"),
        new("MMK", "Myanmar kyat", "K"),
        new("MNT", "Mongolian tögrög", "₮"),
        new("MOP", "Macanese pataca", "MOP$"),
        new("MRU", "Mauritanian ouguiya", "UM"),
        new("MUR", "Mauritian rupee", "Rs"),
        new("MVR", "Maldivian rufiyaa", "Rf"),
        new("MWK", "Malawian kwacha", "MK"),
        new("MZN", "Mozambican metical", "MT"),
        new("NAD", "Namibian dollar", "N$"),
        new("NGN", "Nigerian naira", "₦"),
        new("NIO", "Nicaraguan córdoba", "C$"),
        new("NPR", "Nepalese rupee", "Rs"),
        new("OMR", "Omani rial", "OMR", 3),
        new("PAB", "Panamanian balboa", "B/."),
        new("PEN", "Peruvian sol", "S/"),
        new("PGK", "Papua New Guinean kina", "K"),
        new("PKR", "Pakistani rupee", "Rs"),
        new("PYG", "Paraguayan guaraní", "₲", 0),
        new("QAR", "Qatari riyal", "QR"),
        new("RSD", "Serbian dinar", "RSD"),
        new("RUB", "Russian ruble", "₽"),
        new("RWF", "Rwandan franc", "RF", 0),
        new("SAR", "Saudi riyal", "SR"),
        new("SBD", "Solomon Islands dollar", "SI$"),
        new("SCR", "Seychellois rupee", "SR"),
        new("SDG", "Sudanese pound", "SDG"),
        new("SHP", "Saint Helena pound", "SH£"),
        new("SLE", "Sierra Leonean leone", "Le"),
        new("SOS", "Somali shilling", "Sh"),
        new("SRD", "Surinamese dollar", "SR$"),
        new("SSP", "South Sudanese pound", "SSP"),
        new("STN", "São Tomé and Príncipe dobra", "Db"),
        new("SVC", "Salvadoran colón", "₡"),
        new("SYP", "Syrian pound", "S£"),
        new("SZL", "Eswatini lilangeni", "E"),
        new("TJS", "Tajikistani somoni", "SM"),
        new("TMT", "Turkmenistani manat", "T"),
        new("TND", "Tunisian dinar", "DT", 3),
        new("TOP", "Tongan paʻanga", "T$"),
        new("TTD", "Trinidad and Tobago dollar", "TT$"),
        new("TWD", "New Taiwan dollar", "NT$"),
        new("TZS", "Tanzanian shilling", "TSh"),
        new("UAH", "Ukrainian hryvnia", "₴"),
        new("UGX", "Ugandan shilling", "USh", 0),
        new("UYU", "Uruguayan peso", "$U"),
        new("UZS", "Uzbekistani som", "UZS"),
        new("VES", "Venezuelan bolívar", "Bs.S"),
        new("VND", "Vietnamese đồng", "₫", 0),
        new("VUV", "Vanuatu vatu", "VT", 0),
        new("WST", "Samoan tālā", "WS$"),
        new("XAF", "Central African CFA franc", "FCFA", 0),
        new("XCD", "East Caribbean dollar", "EC$"),
        new("XOF", "West African CFA franc", "CFA", 0),
        new("XPF", "CFP franc", "₣", 0),
        new("YER", "Yemeni rial", "YER"),
        new("ZMW", "Zambian kwacha", "ZK"),
        new("ZWG", "Zimbabwe gold", "ZiG"),
    ];

    public static CurrencyInfo? Find(string? code) =>
        code is null
            ? null
            : Catalog.FirstOrDefault(x =>
                x.Code.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase)
            );

    /// <summary>True for three ASCII letters, the shape of an ISO code.</summary>
    public static bool LooksLikeCode(string? code) =>
        code is { Length: 3 } && code.All(char.IsAsciiLetter);

    /// <summary>"$150,000" or "¥5,000,000": the symbol and the currency's decimals. An unknown code is written as "XYZ 150,000".</summary>
    public static string Format(decimal amount, string code, CurrencyInfo? info = null)
    {
        info ??= Find(code);
        var upper = code.Trim().ToUpperInvariant();
        if (info is null)
            return $"{upper} {amount.ToString("#,0.##", CultureInfo.InvariantCulture)}";
        var number = Math.Round(amount, info.Decimals, MidpointRounding.AwayFromZero)
            .ToString($"#,0.{new string('0', info.Decimals)}", CultureInfo.InvariantCulture);
        // A symbol that is a code (CHF) or already names the dollar flavour reads better with a space.
        return info.Symbol.Length > 1 && char.IsAsciiLetter(info.Symbol[^1])
            ? $"{info.Symbol} {number}"
            : $"{info.Symbol}{number}";
    }

    /// <summary>Converts through the table's base: amount / rate[from] * rate[to]. Null when a side has no rate.</summary>
    public static decimal? Convert(
        decimal amount,
        string from,
        string to,
        string tableBase,
        IReadOnlyDictionary<string, decimal> rates
    )
    {
        from = from.ToUpperInvariant();
        to = to.ToUpperInvariant();
        if (from == to)
            return amount;
        decimal? Rate(string code) =>
            code == tableBase.ToUpperInvariant() ? 1m
            : rates.TryGetValue(code, out var rate) && rate > 0 ? rate
            : null;
        if (Rate(from) is not { } a || Rate(to) is not { } b)
            return null;
        return amount / a * b;
    }
}
