import SchemaCrud from '@/components/forms/SchemaCrud';
import Report from '@/components/reports/Report';

const urlToComponentMap = {
  '/dashboard/form': SchemaCrud,
  '/dashboard/report': Report
};

export default function getComponentForUrl(url) {
  const urlWithoutQueryParams = url.split('?')[0];
  return urlToComponentMap[urlWithoutQueryParams] || null;
}