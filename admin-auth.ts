import 'server-only'
import { getSession } from './auth'

export async function isAdmin() {
  return !!(await getSession())?.isAdmin
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}
