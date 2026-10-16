'use client';

import { Checkbox, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { SettingsSection, useDraft } from './settings-shared';

interface RolePermissions {
  available: string[];
  roles: Record<string, string[]>;
}

const DESCRIPTIONS: Record<string, { label: string; text: string }> = {
  reports: { label: 'Reports', text: 'See hiring reports and export them.' },
  import: { label: 'Import', text: 'Import candidates in bulk from a CSV file.' },
  templates: { label: 'Templates', text: 'Edit the wording of emails sent to candidates.' },
};
const ROLE_LABELS: Record<string, string> = {
  Recruiter: 'Recruiter',
  HiringManager: 'Hiring manager',
  Interviewer: 'Interviewer',
};

export function RolePermissionsSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api.get<RolePermissions>('/api/admin/role-permissions'),
  });
  if (!query.data) return <LoadingBlock rows={1} />;
  return (
    <Editor
      source={query.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['role-permissions'] })}
    />
  );
}

function Editor({ source, onSaved }: { source: RolePermissions; onSaved: () => void }) {
  const { draft, replace, dirty } = useDraft(source);
  const save = useMutation({
    // The API reads the matrix from a field called "permissions".
    mutationFn: () => api.put('/api/admin/role-permissions', { permissions: draft.roles }),
    onSuccess: () => {
      onSaved();
      notifications.show({ color: 'teal', message: 'Roles and permissions saved' });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: error.message }),
  });
  const toggle = (role: string, permission: string, on: boolean) =>
    replace({
      ...draft,
      roles: {
        ...draft.roles,
        [role]: on
          ? [...draft.roles[role], permission]
          : draft.roles[role].filter((x) => x !== permission),
      },
    });
  return (
    <SettingsSection
      id="roles"
      title="Roles and permissions"
      description="Everyone can already do what their role needs. These are the extras. Administrators always have all of them."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
    >
      <Table.ScrollContainer minWidth={480}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Permission</Table.Th>
              {Object.keys(draft.roles).map((role) => (
                <Table.Th key={role} ta="center">
                  {ROLE_LABELS[role] ?? role}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.available.map((permission) => (
              <Table.Tr key={permission}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {DESCRIPTIONS[permission]?.label ?? permission}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {DESCRIPTIONS[permission]?.text}
                  </Text>
                </Table.Td>
                {Object.keys(draft.roles).map((role) => (
                  <Table.Td key={role} ta="center">
                    <Checkbox
                      mx="auto"
                      style={{ display: 'flex', justifyContent: 'center' }}
                      aria-label={`${ROLE_LABELS[role] ?? role}: ${DESCRIPTIONS[permission]?.label ?? permission}`}
                      checked={draft.roles[role].includes(permission)}
                      onChange={(event) => toggle(role, permission, event.currentTarget.checked)}
                    />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SettingsSection>
  );
}
