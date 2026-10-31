import { MODO_DEMO } from '../config.js'
import { mockBackend } from './mockBackend.js'
import { supabaseBackend } from './supabaseBackend.js'

// Una sola interfaz: la app no sabe si habla con Supabase o con el simulador.
export const backend = MODO_DEMO ? mockBackend : supabaseBackend
