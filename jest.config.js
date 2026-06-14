module.exports = {
  preset: 'jest-expo',
  // Scope discovery to the app source so transient git worktrees under .claude/
  // (or any sibling checkout) can never be picked up as part of this project's run.
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.(test|spec).(ts|tsx)'],
};
