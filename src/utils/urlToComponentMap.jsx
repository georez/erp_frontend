import AccForm from '@/components/AccForm';

const urlToComponentMap = {
  '/dashboard/accForm': AccForm,
};

export default function getComponentForUrl(url) {
  const urlWithoutQueryParams = url.split('?')[0];
  return urlToComponentMap[urlWithoutQueryParams] || null;
}