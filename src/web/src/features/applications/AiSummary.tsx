import { Paper, Text } from '@mantine/core';

const HEADINGS = /^(summary|evidence by criterion|open questions)\s*:?$/i;

/** Renders the plain-text AI summary with its headings, labelled as a draft. */
export function AiSummary({ text }: { text: string }) {
  return (
    <Paper withBorder p="sm" mt="md" aria-label="AI summary, a draft">
      <Text size="xs" fw={600} c="dimmed">
        AI summary, a draft. Check it against the notes and scorecards.
      </Text>
      {text.split('\n').map((raw, index) => {
        const line = raw.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');
        if (!line.trim()) return null;
        return HEADINGS.test(line.trim()) || /^#/.test(raw) ? (
          <Text
            key={index}
            size="sm"
            fw={650}
            mt="sm"
            component="h4"
            m={0}
            style={{ marginTop: 12 }}
          >
            {line.replace(/:$/, '')}
          </Text>
        ) : (
          <Text key={index} size="sm" mt={4}>
            {line}
          </Text>
        );
      })}
    </Paper>
  );
}
