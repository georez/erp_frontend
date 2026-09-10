import Form from '@/components/Form';

const urlToComponentMap = {
  '/dashboard/form': Form,
};

export default function getComponentForUrl(url) {
  const urlWithoutQueryParams = url.split('?')[0];
  return urlToComponentMap[urlWithoutQueryParams] || null;
}