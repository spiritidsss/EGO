'use strict';
const list = [
  require('./recolte'),
  require('./meteores'),
  require('./zone'),
  require('./horde'),
  require('./drapeau'),
  require('./geiger'),
  require('./primes'),
  require('./espions'),
];

const GAMES = Object.fromEntries(list.map((G) => [G.meta.id, G]));

function catalogue() {
  return list.map((G) => G.meta);
}

module.exports = { GAMES, catalogue };
