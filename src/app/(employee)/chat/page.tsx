import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';
import { ChatView } from '@/components/chat/chat-view';

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <ChatView firstName={user.name.split(' ')[0] ?? user.name} />;
}
