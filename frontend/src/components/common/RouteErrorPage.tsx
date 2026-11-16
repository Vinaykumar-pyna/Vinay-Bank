import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

/**
 * Rendered by the router when a page throws while rendering or loading a lazy
 * chunk (for example after a deployment replaced old asset files).
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Unexpected error';
  const isChunkError =
    error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);

  return (
    <div className="container py-5 text-center" role="alert">
      <div className="icon-tile icon-tile-danger mx-auto mb-3">
        <i className="bi bi-exclamation-octagon" aria-hidden="true" />
      </div>
      <h1 className="h4">{title}</h1>
      <p className="text-body-secondary">
        {isChunkError
          ? 'A new version of Vinay Bank is available. Reload the page to continue.'
          : 'Something went wrong while showing this page. Our team has been notified.'}
      </p>
      <div className="d-flex gap-2 justify-content-center">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
        <Link to="/" className="btn btn-outline-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
