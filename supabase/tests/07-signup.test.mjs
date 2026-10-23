// Tests for the sign-up trigger handle_new_user() (migration 1), using the
// exact "metadata" our sign-up form sends (src/lib/auth/actions.ts, signUp):
//   { full_name: "...", mobile: "..." }
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Sign-up trigger (website sign-up form)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one } = t;

  // Pretends Supabase Auth made a new user, like the sign-up form does.
  // Takes: an email and the metadata object. Gives back: the new profile row.
  async function signUp(email, metadata) {
    const id = crypto.randomUUID();
    await one('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, metadata]);
    return one('select full_name, email, mobile, role, is_active from public.profiles where id = $1', [id]);
  }

  // ===========================================================================
  t.section('Sign-up form details are saved');
  // ===========================================================================
  let p = await signUp('juan@test.example', { full_name: 'Juan dela Cruz', mobile: '0917 123 4567' });
  check('Name, phone and email from the sign-up form', 'Juan dela Cruz / 0917 123 4567 / juan@test.example',
    p?.full_name === 'Juan dela Cruz' && p?.mobile === '0917 123 4567' && p?.email === 'juan@test.example',
    p && `${p.full_name} / ${p.mobile} / ${p.email}`);
  check('New account is an active client', 'client, active',
    p?.role === 'client' && p?.is_active === true, p && `${p.role}, ${p.is_active ? 'active' : 'inactive'}`);

  p = await signUp('blank@test.example', { full_name: 'No Phone', mobile: '   ' });
  check('A blank phone number is saved as empty (null)', 'null', p?.mobile === null, p?.mobile);

  p = await signUp('google@test.example', { name: 'Google Name' });
  check('Google login\'s "name" is used when there is no full_name', 'Google Name', p?.full_name === 'Google Name', p?.full_name);

  // ===========================================================================
  t.section('Google sign-in (Change 17)');
  // ===========================================================================
  // The metadata Supabase saves for a real Google sign-in. Google gives no
  // phone number or birthday, so both must stay empty: the website then asks
  // for them on "Finish your profile" before booking.
  const googleMeta = {
    iss: 'https://accounts.google.com',
    sub: '112233445566778899',
    name: 'Maria Santos',
    full_name: 'Maria Santos',
    email: 'maria.santos@school.example',
    email_verified: true,
    phone_verified: false,
    picture: 'https://lh3.googleusercontent.com/a/example',
    avatar_url: 'https://lh3.googleusercontent.com/a/example',
    provider_id: '112233445566778899',
  };
  const googleId = crypto.randomUUID();
  await one('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [googleId, 'maria.santos@school.example', googleMeta]);
  const g = await one('select full_name, email, mobile, birthday, role from public.profiles where id = $1', [googleId]);
  check('Google account: name and email saved, any email domain allowed', 'Maria Santos / maria.santos@school.example',
    g?.full_name === 'Maria Santos' && g?.email === 'maria.santos@school.example', g && `${g.full_name} / ${g.email}`);
  check('Google account: no mobile or birthday yet (asked on "Finish your profile")', 'null / null',
    g?.mobile === null && g?.birthday === null, g && `${g.mobile} / ${g.birthday}`);
  check('Google account is a client', 'client', g?.role === 'client', g?.role);

  // ===========================================================================
  t.section('Sign-up can\'t make an admin');
  // ===========================================================================
  // Anyone can call Supabase's sign-up directly and add their own metadata,
  // so the trigger must ignore a "role" or "is_active" sent that way.
  p = await signUp('sneaky@test.example', { full_name: 'Sneaky', role: 'admin', is_active: false });
  check('Metadata role: "admin" is ignored', 'client, active',
    p?.role === 'client' && p?.is_active === true, p && `${p.role}, ${p.is_active ? 'active' : 'inactive'}`);
}
