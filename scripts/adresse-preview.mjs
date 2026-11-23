// Adresse de preview d'une branche, comme Vercel la nomme pour l'équipe luce-team et le projet montisapp :
// « / » et tout caractère spécial deviennent « - » (scripts/deployer.mjs)
export function adresseBranche(branche, { projet = 'montisapp', equipe = 'luce-team' } = {}) {
  const morceau = String(branche).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${projet}-git-${morceau}-${equipe}.vercel.app`;
}
