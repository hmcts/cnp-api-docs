import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

// Renders one OpenAPI document. Loaded as a client:only island so the ~200 other
// pages ship no JavaScript for it.
//
// The URL points at the normalised copy under specs/_normalised/, which is
// always OpenAPI 3.x — the 54 legacy Swagger 2.0 specs are upgraded at build
// time so this component never sees two formats. docs/specs/ keeps serving the
// publishers' original bytes at its own URL.
export default function SpecViewer({ url }) {
  return (
    <ApiReferenceReact
      configuration={{
        url,
        // The page already has a heading and breadcrumbs.
        hideModels: false,
        hideDownloadButton: false,
        darkMode: false,
      }}
    />
  );
}
