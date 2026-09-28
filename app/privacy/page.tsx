export const metadata = {
  title: 'Privacy Policy — Thiam Language Translator',
};

export default function PrivacyPage() {
  return (
    <main style={styles.container}>
      <h1 style={styles.h1}>Privacy Policy — Thiam Language Translator</h1>
      <p style={styles.meta}>Last updated: May 25, 2026</p>

      <hr style={styles.hr} />

      <h2 style={styles.h2}>What This App Does</h2>
      <p style={styles.p}>
        Thiam Language Translator records your voice, transcribes it, translates it into your
        chosen language, and plays the translation back aloud. No account or login is required.
      </p>

      <h2 style={styles.h2}>Data We Collect</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Data</th>
            <th style={styles.th}>Why</th>
            <th style={styles.th}>How long</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={styles.td}><strong>Audio recording</strong></td>
            <td style={styles.td}>To transcribe your speech</td>
            <td style={styles.td}>Sent to OpenAI, not stored by us</td>
          </tr>
          <tr>
            <td style={styles.td}><strong>Source and target language</strong></td>
            <td style={styles.td}>To perform the correct translation</td>
            <td style={styles.td}>Sent to OpenAI, not stored by us</td>
          </tr>
        </tbody>
      </table>
      <p style={styles.p}>
        We do not collect your name, email address, location, device identifiers, or any other
        personal information.
      </p>

      <h2 style={styles.h2}>How Your Data Is Used</h2>
      <p style={styles.p}>
        Your audio and language selections are sent to <strong>OpenAI</strong> (openai.com) for
        processing:
      </p>
      <ol style={styles.ol}>
        <li style={styles.li}>Audio → OpenAI Whisper (speech-to-text transcription)</li>
        <li style={styles.li}>Transcript → OpenAI GPT-4o-mini (translation)</li>
        <li style={styles.li}>Translation → OpenAI TTS (text-to-speech audio)</li>
      </ol>
      <p style={styles.p}>
        The translated audio is returned to your device and played back. Nothing is stored on our
        servers after the response is returned.
      </p>
      <p style={styles.p}>
        OpenAI&apos;s privacy policy is available at:{' '}
        <a href="https://openai.com/policies/privacy-policy" style={styles.a}>
          https://openai.com/policies/privacy-policy
        </a>
      </p>

      <h2 style={styles.h2}>Data Storage</h2>
      <ul style={styles.ul}>
        <li style={styles.li}>We do not store your audio recordings.</li>
        <li style={styles.li}>We do not store your transcripts or translations.</li>
        <li style={styles.li}>We do not have a database of user data.</li>
        <li style={styles.li}>
          The only data that temporarily passes through our backend is your audio and language
          selections, solely to forward them to OpenAI and return the result.
        </li>
      </ul>

      <h2 style={styles.h2}>Third-Party Services</h2>
      <p style={styles.p}>This app uses the following third-party service:</p>
      <ul style={styles.ul}>
        <li style={styles.li}>
          <strong>OpenAI</strong> — for transcription, translation, and text-to-speech. Subject to
          OpenAI&apos;s privacy policy and terms of service.
        </li>
      </ul>

      <h2 style={styles.h2}>Microphone Permission</h2>
      <p style={styles.p}>
        The app requests access to your device&apos;s microphone solely to record speech for
        translation. Microphone access is only active while you are actively recording. We do not
        record audio in the background.
      </p>

      <h2 style={styles.h2}>Children&apos;s Privacy</h2>
      <p style={styles.p}>
        This app is rated 4+ / Everyone and does not knowingly collect data from children under 13.
      </p>

      <h2 style={styles.h2}>Changes to This Policy</h2>
      <p style={styles.p}>
        If we update this privacy policy, we will update the &quot;Last updated&quot; date at the
        top of this page.
      </p>

      <h2 style={styles.h2}>Contact</h2>
      <p style={styles.p}>
        If you have questions about this privacy policy, contact us at:{' '}
        <a href="mailto:alphathiam@icloud.com" style={styles.a}>
          alphathiam@icloud.com
        </a>
      </p>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '48px 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1a1a1a',
    lineHeight: 1.7,
  },
  h1: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
  },
  h2: {
    fontSize: 20,
    fontWeight: 600,
    marginTop: 36,
    marginBottom: 8,
  },
  meta: {
    color: '#666',
    fontSize: 14,
    marginBottom: 24,
  },
  hr: {
    border: 'none',
    borderTop: '1px solid #e5e5e5',
    marginBottom: 32,
  },
  p: {
    marginBottom: 16,
  },
  ul: {
    paddingLeft: 24,
    marginBottom: 16,
  },
  ol: {
    paddingLeft: 24,
    marginBottom: 16,
  },
  li: {
    marginBottom: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 16,
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #e5e5e5',
    fontSize: 14,
    fontWeight: 600,
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e5e5',
    fontSize: 14,
  },
  a: {
    color: '#0070f3',
  },
};
