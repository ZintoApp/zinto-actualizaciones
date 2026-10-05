/** Let the browser stream the download to disk instead of buffering a Blob in memory. */
export async function downloadConversationMedia(url: string) {
  const response = await fetch(url, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'This media is no longer available.' : 'Unable to download media. Please try again.');
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
