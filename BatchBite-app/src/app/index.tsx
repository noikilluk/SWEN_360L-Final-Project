import { Redirect } from 'expo-router';

import { homeHrefFor } from '@/state/navigation';
import { useCurrentUser } from '@/state/app-provider';

/** Entry point: sends each user to the home screen for their role. */
export default function Index() {
  const user = useCurrentUser();
  if (!user) return <Redirect href="/sign-in" />;
  if (user.mustChangePassword) return <Redirect href={{ pathname: '/account/password', params: { forced: '1' } }} />;
  return <Redirect href={homeHrefFor(user.role)} />;
}
