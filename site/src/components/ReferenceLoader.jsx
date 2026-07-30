import { useEffect, useState } from 'react';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

// Reads ?url= at runtime, because a static build cannot know it. Used by the
// swagger.html shim for specs that are not hosted here.
export default function ReferenceLoader() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('url');
    if (!raw) return;
    // Only http(s): a javascript: or data: URL here would be reflected into the
    // page from a query parameter.
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') setUrl(parsed.toString());
    } catch {
      /* leave unset; the empty state explains what to do */
    }
  }, []);

  if (!url) {
    return (
      <div className="panel">
        <p>
          No specification URL was given. Add <code>?url=</code> followed by the address of an
          OpenAPI document, or browse the catalogue.
        </p>
      </div>
    );
  }

  return <ApiReferenceReact configuration={{ url }} />;
}
