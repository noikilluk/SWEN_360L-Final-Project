import { PASSWORD, createScenario } from '@/test-utils/scenario';

describe('accounts and security (US-01, FR-01, NFR-03)', () => {
  it('signs up customers with a hashed password and logs them in', async () => {
    const s = await createScenario();
    const user = await s.services.auth.signUp({ username: '  New.User ', password: 'longenough', confirmPassword: 'longenough' });
    expect(user).toMatchObject({ username: 'new.user', role: 'customer' });
    expect(user.passwordHash).not.toContain('longenough');
    await expect(s.services.auth.logIn('NEW.USER', 'longenough')).resolves.toMatchObject({ id: user.id });
  });

  it('validates sign up input and rejects taken usernames', async () => {
    const s = await createScenario();
    await expect(s.services.auth.signUp({ username: 'ab', password: 'longenough', confirmPassword: 'longenough' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(s.services.auth.signUp({ username: 'valid', password: 'short', confirmPassword: 'short' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(s.services.auth.signUp({ username: 'valid', password: 'longenough', confirmPassword: 'different' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(s.services.auth.signUp({ username: 'alice', password: 'longenough', confirmPassword: 'longenough' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('uses one message for wrong usernames and passwords, and locks after five failures', async () => {
    const s = await createScenario();
    await expect(s.services.auth.logIn('alice', 'wrong-password')).rejects.toThrow('Incorrect username or password.');
    await expect(s.services.auth.logIn('nobody', 'wrong-password')).rejects.toThrow('Incorrect username or password.');
    for (let i = 0; i < 4; i++) await s.services.auth.logIn('alice', 'wrong-password').catch(() => undefined);
    await expect(s.services.auth.logIn('alice', PASSWORD)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    s.clock.advanceMinutes(2);
    await expect(s.services.auth.logIn('alice', PASSWORD)).resolves.toMatchObject({ username: 'alice' });
  });

  it('handles a forgotten password through the administrator', async () => {
    const s = await createScenario();
    await s.services.auth.requestPasswordReset('alice');
    const state = s.db.getState();
    expect(Object.values(state.resetRequests)).toEqual([expect.objectContaining({ username: 'alice', status: 'pending' })]);
    expect(Object.values(state.notifications).some((n) => n.userId === s.admin.id && n.kind === 'password_reset_requested')).toBe(true);

    const temporary = await s.services.admin.issueTemporaryPassword(s.admin.id, s.alice.id);
    const user = await s.services.auth.logIn('alice', temporary);
    expect(user.mustChangePassword).toBe(true);
    await s.services.auth.changePassword(s.alice.id, temporary, 'brand-new-pass', 'brand-new-pass');
    await expect(s.services.auth.logIn('alice', 'brand-new-pass')).resolves.toMatchObject({ mustChangePassword: false });
    expect(Object.values(s.db.getState().resetRequests)[0].status).toBe('resolved');
  });

  it('deactivated accounts cannot log in and there is always one administrator', async () => {
    const s = await createScenario();
    await s.services.admin.updateUser(s.admin.id, s.bob.id, { active: false });
    await expect(s.services.auth.logIn('bob', PASSWORD)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.services.admin.updateUser(s.admin.id, s.admin.id, { role: 'customer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.services.admin.updateUser(s.owner.id, s.bob.id, { active: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admins create staff who must choose their own password', async () => {
    const s = await createScenario();
    const staff = await s.services.admin.createUser(s.admin.id, { username: 'baker2', displayName: 'Baker Two', role: 'kitchen', password: 'temporary1' });
    expect(staff).toMatchObject({ role: 'kitchen', mustChangePassword: true });
  });

  it('validates settings', async () => {
    const s = await createScenario();
    await expect(s.services.admin.updateSettings(s.admin.id, { defaultSlotCapacity: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await s.services.admin.updateSettings(s.admin.id, { businessName: 'Kishan Kakes', pickupGraceMinutes: 15 });
    expect(s.db.getState().settings).toMatchObject({ businessName: 'Kishan Kakes', pickupGraceMinutes: 15 });
  });
});
