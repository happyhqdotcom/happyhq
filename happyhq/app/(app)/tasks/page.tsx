import { TaskListHome } from '@/components/features/tasks/list/task-list-home'
import { listAllTaskItems } from '@/lib/fs/read.server'
import { taskItemsKey } from '@/lib/swr-keys'
import { SWRConfig } from 'swr'

export default async function TasksHome() {
  const tasks = await listAllTaskItems()
  return (
    <SWRConfig value={{ fallback: { [taskItemsKey()]: tasks } }}>
      <TaskListHome />
    </SWRConfig>
  )
}
