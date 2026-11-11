import supabase from '../lib/supabase.js'

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    // Use Supabase to verify the token instead of jsonwebtoken
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      console.error('JWT verify error:', err.message)
      return res.status(403).json({ error: 'Invalid or expired token' })
    }

    req.user = {
      sub:   user.id,
      id:    user.id,
      email: user.email,
      role:  user.role
    }

    next()
  } catch (err) {
    console.error('JWT verify error:', err.message)
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

export default verifyJWT