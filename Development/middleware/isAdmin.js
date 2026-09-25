import supabase from '../lib/supabase.js'

const isAdmin = async (req, res, next) => {
  
  const { data: student, error } = await supabase
    .from('students')
    .select('role, assigned_courses')
    .eq('id', req.user.sub)
    .single()


  if (!student || !['admin', 'super_admin', 'administration'].includes(student.role)) {
    console.log('isAdmin DENIED - role:', student?.role)
    return res.status(403).json({ error: 'Admin access required' })
  }

  req.adminRole = student.role
  next()
}
// test
export default isAdmin