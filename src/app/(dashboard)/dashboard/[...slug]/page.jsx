
export default async function Page({params}) {
  const { slug } = await params;
  console.log('slug', slug);
  return;
}