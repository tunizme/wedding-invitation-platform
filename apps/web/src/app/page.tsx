import { publicEnvironment } from '../config/env';

export default function FoundationPage() {
  const environment = publicEnvironment();
  return (
    <main
      style={{
        fontFamily: 'system-ui',
        maxWidth: 720,
        margin: '4rem auto',
        padding: '1rem',
      }}
    >
      <h1>Wedding Invitation Platform</h1>
      <p>Project Foundation is ready for MVP feature development.</p>
      <p>
        REST API base: <code>{environment.NEXT_PUBLIC_API_BASE_URL}</code>
      </p>
    </main>
  );
}
