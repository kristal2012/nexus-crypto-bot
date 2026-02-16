/**
 * User Configuration - SSOT for fixed user identity
 * 
 * Since auth was removed for personal use, this provides a fixed user_id
 * used across all hooks and services.
 */

export const FIXED_USER_ID = '00000000-0000-0000-0000-000000000000';

export const IS_SIMULATION_MODE = (typeof process !== 'undefined' && process.env?.VITE_TRADING_MODE === 'test') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_TRADING_MODE === 'test') ||
    (typeof window !== 'undefined' && window.location.hostname === 'nexus-crypto-bot.vercel.app' && !localStorage.getItem('binance_api_key_status'));
