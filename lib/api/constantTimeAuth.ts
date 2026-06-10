// Precomputed cost-10 bcryptjs hash used for constant-time authentication.
//
// When a login is attempted for an email that does not exist, we still run
// bcrypt.compare against this dummy hash so that the response time matches the
// "wrong password" path. This closes a user-enumeration timing side-channel
// (#61): without it, a "no such user" response returns measurably faster than a
// "wrong password" response, leaking which emails are registered.
//
// This hash is of the string 'not-a-real-password' and will never match any
// real user password. Generated via:
//   node -e "console.log(require('bcryptjs').hashSync('not-a-real-password', 10))"
export const DUMMY_PASSWORD_HASH = '$2b$10$tHN8J0S8zooRBInsS3TDZ.LrfSAHGjQq6gLHHKKl3rB6Tr35Yy2E2'
