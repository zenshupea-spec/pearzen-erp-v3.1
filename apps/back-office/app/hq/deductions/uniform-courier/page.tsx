import { getUniformCourierQueue } from '../actions';
import UniformCourierWorkbench from './UniformCourierWorkbench';

export const dynamic = 'force-dynamic';

export default async function UniformCourierPage() {
  const queue = await getUniformCourierQueue();
  return <UniformCourierWorkbench initial={queue} />;
}
