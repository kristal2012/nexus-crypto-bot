/**
 * Test User Service
 * 
 * SRP: Gerencia o usuário de teste fixo para ambiente de desenvolvimento
 * Durante os testes, usaremos um UUID fixo para simular um usuário
 */

// UUID fixo para testes - será usado em todo o sistema
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

export const getTestUserId = (): string => {
  return TEST_USER_ID;
};

export const isTestMode = (): boolean => {
  // Em produção, isso deve ser false
  return true;
};
