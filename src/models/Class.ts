export * from './class/Class'
export * from './class/Student'
export * from './class/ClassHistory'
// As listas de inativação vivem no modelo de topo: é o que o main passou a
// escrever e o único com guarda contra registo duplicado do mesmo nome de
// modelo. Havia aqui uma segunda definição, com o schema antigo e sem guarda —
// qual das duas ganhava dependia da ordem dos imports.
export { default as InactivationList, type IInactivationList } from './InactivationList'
export * from './class/contracts'
