import SchemaCrud from '@/components/forms/SchemaCrud';
import Report from '@/components/reports/Report';

// Each dashboard URL renders a fixed component. The entries return elements (rather than being the
// components themselves) so callers never render a component chosen at render time.
const urlToComponentMap = {
  '/dashboard/form': (props) => <SchemaCrud {...props} />,
  '/dashboard/report': (props) => <Report {...props} />,
};

function pathOf(url) {
  return url.split('?')[0];
}

export function hasComponentForUrl(url) {
  return Object.hasOwn(urlToComponentMap, pathOf(url));
}

/** Renders the component for a dashboard URL, or null when the URL is unknown. */
export default function renderComponentForUrl(url, props) {
  const render = urlToComponentMap[pathOf(url)];
  return render ? render(props) : null;
}
