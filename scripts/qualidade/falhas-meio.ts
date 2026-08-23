const pontos = [
  { ponto: 'rasto antes da AC falha', resultado: 'AC não é chamada; claim libertado', preso: false },
  { ponto: 'AC devolve false/throw', resultado: 'rasto passa a recusado; watermark não avança; retry possível', preso: false },
  { ponto: 'AC aceita e confirmação Mongo falha', resultado: 'fica finalizacao-pendente; corrida seguinte reconcilia pela fotografia', preso: false },
  { ponto: 'claim concorrente', resultado: 'um vencedor escreve; o outro vê claimConflict/confirmationPending', preso: false },
  { ponto: 'fotografia AC antiga ou sem evento novo', resultado: 'salta sem nova escrita; watermark não regride', preso: false }
]
console.log(JSON.stringify({ pontos: pontos.length, ficamPresos: pontos.filter((p) => p.preso).length, pontos }, null, 2))
