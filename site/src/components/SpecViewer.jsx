import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

// Renders one OpenAPI document. Loaded as a client:only island so the ~250 other
// pages ship no JavaScript for it.
//
// The URL points at the normalised copy under specs/_normalised/, which is always
// OpenAPI 3.x — the 54 legacy Swagger 2.0 specs are upgraded at build time, so
// this only ever sees one format. docs/specs/ keeps serving the publishers'
// original bytes at its own URL.
export default function SpecViewer({ url }) {
  return (
    <SwaggerUI
      url={url}
      // These APIs all need S2S and IDAM tokens, so the request builder cannot
      // work from a browser here. Showing it invites failed calls.
      tryItOutEnabled={false}
      supportedSubmitMethods={[]}
      docExpansion="list"
      deepLinking
      defaultModelsExpandDepth={0}
    />
  );
}
