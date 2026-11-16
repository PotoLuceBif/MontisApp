// Petite fenêtre de question posée par-dessus tout, avec un champ facultatif.
// Renvoie le choix fait ({ choix, valeur }) ; Échap ou un appui à côté valent « annuler ».

export function demanderChoix({ titre, texte = '', champ = null, choix }) {
  return new Promise((resoudre) => {
    const fond = document.createElement('div');
    fond.className = 'dialogue-fond';
    const boite = document.createElement('div');
    boite.className = 'dialogue';
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-modal', 'true');
    const entete = document.createElement('h3');
    entete.textContent = titre;
    entete.id = `dialogue-${Date.now()}`;
    boite.setAttribute('aria-labelledby', entete.id);
    boite.append(entete);
    if (texte) {
      const paragraphe = document.createElement('p');
      paragraphe.textContent = texte;
      boite.append(paragraphe);
    }
    let saisie = null;
    if (champ) {
      const etiquette = document.createElement('label');
      etiquette.className = 'dialogue-champ';
      etiquette.textContent = champ.libelle;
      saisie = document.createElement('input');
      saisie.type = 'text';
      saisie.maxLength = champ.max ?? 60;
      saisie.value = champ.valeur ?? '';
      if (champ.indication) saisie.placeholder = champ.indication;
      etiquette.append(saisie);
      boite.append(etiquette);
    }
    const boutons = document.createElement('div');
    boutons.className = 'dialogue-boutons';
    choix.forEach(({ id, libelle, principal }) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = `para-bouton${principal ? ' para-bouton-principal' : ''}`;
      bouton.textContent = libelle;
      bouton.addEventListener('click', () => finir(id));
      boutons.append(bouton);
    });
    boite.append(boutons);
    fond.append(boite);
    document.body.append(fond);

    const auClavier = (event) => {
      if (event.key === 'Escape') finir('annuler');
      if (event.key === 'Enter' && event.target === saisie) finir(choix.find(({ principal }) => principal)?.id ?? 'annuler');
    };
    function finir(id) {
      document.removeEventListener('keydown', auClavier);
      fond.remove();
      resoudre({ choix: id, valeur: saisie ? saisie.value.trim() : '' });
    }
    fond.addEventListener('click', (event) => {
      if (event.target === fond) finir('annuler');
    });
    document.addEventListener('keydown', auClavier);
    (boutons.querySelector('.para-bouton-principal') ?? boutons.firstChild)?.focus({ preventScroll: true });
  });
}
