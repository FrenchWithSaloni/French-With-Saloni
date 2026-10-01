import supabase from '../lib/supabase.js'

const isAdministration = async (req, res, next) => {
  const { data: student } = await supabase
    .from('students')
    .select('role')
    .eq('id', req.user.sub)
    .single()

  if (!student || !['admin', 'super_admin', 'administration'].includes(student.role)) {
    return res.status(403).json({ error: 'Access required' })
  }

  req.adminRole = student.role
  next()
}

export default isAdministration