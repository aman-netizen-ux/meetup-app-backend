export class InvalidIdentityToken extends Error {
  constructor() {
    super('Invalid identity token.');
    this.name = 'InvalidIdentityToken';
  }
}
