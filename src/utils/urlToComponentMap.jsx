import AccForm from '@/components/forms/AccForm';
import SchemaCrud from '@/components/forms/SchemaCrud';

const urlToComponentMap = {
  '/dashboard/accForm': AccForm,
  '/dashboard/form': SchemaCrud
};

export default function getComponentForUrl(url) {
  const urlWithoutQueryParams = url.split('?')[0];
  return urlToComponentMap[urlWithoutQueryParams] || null;
}