import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  render,
} from '@react-email/components';
import type { StatKind } from '@/lib/types';

export interface MorningTask {
  name: string;
  stat: StatKind; // 'INT' | 'STR' | 'DIS'
}

export interface MorningEmailProps {
  username: string;
  tasks: MorningTask[];
  appUrl: string;
}

export interface WeeklyEmailProps {
  username: string;
  appUrl: string;
}

// --- DayMaxing dark brand palette ---
const colors = {
  bg: '#0a0a0f',
  card: '#13131c',
  border: '#262635',
  text: '#e6e6f0',
  muted: '#8a8aa0',
  accent: '#7c5cff',
  accentText: '#ffffff',
};

const STAT_COLOR: Record<StatKind, string> = {
  INT: '#4f9dff',
  STR: '#ff6b6b',
  DIS: '#7c5cff',
};

const main: React.CSSProperties = {
  backgroundColor: colors.bg,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '32px 0',
};

const container: React.CSSProperties = {
  backgroundColor: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: '14px',
  margin: '0 auto',
  maxWidth: '480px',
  padding: '36px 32px',
};

const brand: React.CSSProperties = {
  color: colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  margin: '0 0 20px',
};

const heading: React.CSSProperties = {
  color: colors.text,
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 8px',
};

const lead: React.CSSProperties = {
  color: colors.muted,
  fontSize: '15px',
  lineHeight: '22px',
  margin: '0 0 24px',
};

const taskRow: React.CSSProperties = {
  borderBottom: `1px solid ${colors.border}`,
  padding: '12px 0',
};

const taskName: React.CSSProperties = {
  color: colors.text,
  fontSize: '15px',
  margin: 0,
};

const button: React.CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: '10px',
  color: colors.accentText,
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 28px',
  textDecoration: 'none',
};

function statBadge(stat: StatKind): React.CSSProperties {
  return {
    backgroundColor: `${STAT_COLOR[stat]}22`,
    border: `1px solid ${STAT_COLOR[stat]}`,
    borderRadius: '6px',
    color: STAT_COLOR[stat],
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    marginLeft: '8px',
    padding: '2px 7px',
  };
}

export function MorningEmail({ username, tasks, appUrl }: MorningEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Here&apos;s today&apos;s run, {username}.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>DayMaxing</Text>
          <Heading style={heading}>Good morning, {username}</Heading>
          <Text style={lead}>Here&apos;s today&apos;s run:</Text>
          <Section>
            {tasks.length === 0 ? (
              <Text style={{ ...taskName, color: colors.muted }}>
                No tasks set for today — open the app to plan your day.
              </Text>
            ) : (
              tasks.map((t, idx) => (
                <Section key={idx} style={taskRow}>
                  <Text style={taskName}>
                    {t.name}
                    <span style={statBadge(t.stat)}>{t.stat}</span>
                  </Text>
                </Section>
              ))
            )}
          </Section>
          <Section style={{ paddingTop: '28px' }}>
            <Button href={appUrl} style={button}>
              Open DayMaxing
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function WeeklyEmail({ username, appUrl }: WeeklyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Plan your week on DayMaxing</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>DayMaxing</Text>
          <Heading style={heading}>Plan your week</Heading>
          <Text style={lead}>
            New week, {username}. Open DayMaxing and set this week&apos;s tasks so
            your daily runs are ready to go.
          </Text>
          <Section style={{ paddingTop: '8px' }}>
            <Button href={appUrl} style={button}>
              Plan this week
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function morningEmailHtml(props: MorningEmailProps): Promise<string> {
  return render(<MorningEmail {...props} />);
}

export function weeklyEmailHtml(props: WeeklyEmailProps): Promise<string> {
  return render(<WeeklyEmail {...props} />);
}
