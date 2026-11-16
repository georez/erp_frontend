// What the backend accepts for a password (UserService): checked here too, so the form says it before sending
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Why the new password typed twice can't be used, or null when it can; nothing while it's still empty. */
export function newPasswordProblem(password, again) {
  if (password === '') {
    return null;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `${PASSWORD_MAX_LENGTH} حرفاً على الأكثر`;
  }
  if (again !== '' && again !== password) {
    return 'كلمتا المرور غير متطابقتين';
  }
  return null;
}
