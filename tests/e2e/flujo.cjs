// Prueba de punta a punta del modo demo (backend simulado). Ver docs/PRUEBAS_E2E.md.
// Uso: npm i --no-save playwright; npx playwright install chromium; npx vite --port 5199 &  node tests/e2e/flujo.cjs
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://127.0.0.1:5199/?dwell=6&cooldown=8&acceso=20'
const CAF = { latitude: 6.280119, longitude: -75.583186, accuracy: 5 }
let fallos = 0
const ok = (c, m) => { console.log((c ? 'PASA  ' : 'FALLA ') + m); if (!c) fallos++ }
const txt = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')) || ''
const reg = async (p, email) => {
  await p.getByRole('button', { name: /Entrar/ }).first().click()
  await p.getByRole('button', { name: /Regístrate/ }).click()
  await p.getByLabel('Correo').fill(email); await p.getByLabel('Contraseña').fill('secreto1')
  await p.getByRole('button', { name: 'Crear cuenta' }).last().click()
  await p.getByTestId('salir').waitFor()
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, geolocation: CAF, permissions: ['geolocation'] })
  const consola = []
  const A = await ctx.newPage(); A.on('pageerror', e => consola.push('A: ' + e.message)); A.on('console', m => m.type() === 'error' && consola.push('A: ' + m.text()))
  await A.goto(BASE)
  await A.locator('.chip-local').first().waitFor()
  ok((await A.locator('.chip-local').count()) === 4, 'T03 muestra 4 locales sin sesión')
  ok(await A.getByTestId('mapa').isVisible(), 'T03 mapa visible')
  ok(await A.getByTestId('estado-sin-sesion').isVisible(), 'T06 sin sesión: estado bloqueado')
  ok(await A.getByTestId('accion-sin-sesion').isVisible(), 'T02 sin sesión: check-in pide iniciar sesión')

  // login incorrecto + registro
  await A.getByRole('button', { name: /Entrar/ }).first().click()
  await A.getByLabel('Correo').fill('nadie@x.co'); await A.getByLabel('Contraseña').fill('secreto1')
  await A.getByRole('button', { name: 'Entrar' }).last().click()
  await A.getByRole('alert').waitFor()
  ok((await txt(A, '[role=alert]')).includes('incorrectos'), 'T02 error de login en español')
  await A.getByRole('button', { name: 'Cerrar' }).click()
  await reg(A, 'a@x.co')
  ok(true, 'T02 registro y sesión iniciada')
  await A.waitForSelector('[data-testid=estado-bloqueado]')
  ok(true, 'T06 con sesión y sin reporte: estado bloqueado')
  ok((await txt(A, '[data-testid=pista-geofence]')).includes('Cafetería principal'), 'T04 pista: estás en Cafetería principal (GPS real simulado)')

  // check-in + countdown
  await A.getByRole('button', { name: 'Estoy aquí' }).click()
  await A.getByTestId('accion-reporte').waitFor()
  ok((await txt(A, '[data-testid=accion-reporte]')).includes('Check-in en Cafetería principal'), 'T04 check-in muestra el local')
  ok(await A.getByTestId('cuenta').isVisible(), 'T04 cuenta regresiva visible')
  ok(await A.locator('.valor').first().isDisabled(), 'T05 antes del dwell-time los botones están deshabilitados')
  await A.waitForSelector('[data-testid=espera]', { state: 'detached', timeout: 12000 })
  ok(!(await A.locator('.valor').first().isDisabled()), 'T05 tras el dwell-time se habilita')

  // reportar
  await A.locator('.valor[data-valor=larga]').click()
  await A.waitForSelector('[data-testid=estado-desbloqueado]')
  ok((await txt(A, '[data-testid=estado-fila]')).includes('Larga'), 'T05/T06 reporte ok y estado desbloqueado muestra Fila Larga')
  ok((await txt(A, '[data-testid=mensaje]')).includes('Gracias'), 'T05 mensaje de éxito')
  await A.locator('.valor[data-valor=corta]').click()
  await A.waitForFunction(() => document.querySelector('[data-testid=mensaje]')?.textContent.includes('hace poco'))
  ok(true, 'T05 TC-10 segundo reporte del mismo tipo: «demasiado pronto»')

  // reload mantiene sesión y check-in
  await A.reload(); await A.getByTestId('salir').waitFor()
  await A.getByTestId('accion-reporte').waitFor()
  ok(true, 'T02 recargar mantiene sesión (y el check-in vigente)')

  // B: segundo usuario en otra pestaña (misma "BD", sesión distinta)
  const B = await ctx.newPage(); B.on('pageerror', e => consola.push('B: ' + e.message))
  await B.goto(BASE); await B.locator('.chip-local').first().waitFor()
  await reg(B, 'b@x.co')
  await B.waitForSelector('[data-testid=estado-bloqueado]')
  ok(true, 'T06 usuario B sin reportes no ve el estado de A')
  // A mira Apolo 11 (sin reportes aún)
  await A.locator('.chip-local', { hasText: 'Apolo 11' }).click()
  await A.waitForFunction(() => document.querySelector('[data-testid=estado-desbloqueado]')?.textContent.includes('Sin reportes recientes'))
  ok(true, 'T06 A (con acceso) ve «Sin reportes recientes» en Apolo 11')
  // B se "mueve" a Apolo 11 por el simulador y reporta
  await B.getByLabel('Simular ubicación').selectOption({ label: 'Simular: Cafetería Apolo 11' })
  await B.getByRole('button', { name: 'Estoy aquí' }).click()
  await B.getByTestId('accion-reporte').waitFor()
  await B.waitForSelector('[data-testid=espera]', { state: 'detached', timeout: 12000 })
  await B.getByRole('tab', { name: 'Aforo' }).click()
  await B.locator('.valor[data-valor=alto]').click()
  await B.waitForSelector('[data-testid=estado-desbloqueado]')
  // T07: A debe verlo sin recargar
  await A.waitForFunction(() => document.querySelector('[data-testid=estado-aforo]')?.textContent.includes('Alto'), null, { timeout: 5000 })
  ok(true, 'T07 realtime: A ve el aforo Alto reportado por B sin recargar')

  // T07 / TC-08: A pierde conexión, B reporta, A vuelve y se reconcilia
  await A.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')) })
  await A.waitForFunction(() => document.querySelector('[data-testid=conexion]')?.textContent.includes('Sin conexión'))
  ok(true, 'T07 indicador «Sin conexión»')
  await B.getByRole('tab', { name: 'Aforo' }).click()
  await B.waitForTimeout(9000) // cooldown 8 s
  await B.locator('.valor[data-valor=lleno]').click()
  await B.waitForFunction(() => document.querySelector('[data-testid=estado-aforo]')?.textContent.includes('Lleno'))
  await A.waitForTimeout(500)
  ok((await txt(A, '[data-testid=estado-aforo]')).includes('Alto'), 'T07 sin red, A conserva el dato viejo (no se entera)')
  await A.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')) })
  await A.waitForFunction(() => document.querySelector('[data-testid=estado-aforo]')?.textContent.includes('Lleno'), null, { timeout: 5000 })
  ok(true, 'T07 al volver la red, A se reconcilia solo (Lleno)')
  ok((await txt(A, '[data-testid=conexion]')).includes('En vivo'), 'T07 indicador vuelve a «En vivo»')

  // Acceso vence (acceso=20 s desde el último reporte de A): bloqueado de nuevo
  await A.waitForTimeout(21000)
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await A.waitForSelector('[data-testid=estado-bloqueado]', { timeout: 5000 })
  ok(true, 'T06 vencido el acceso, A vuelve a bloqueado')


  // ===== Pase gratis (1 sitio) =====
  const P = await ctx.newPage(); P.on('pageerror', e => consola.push('P: ' + e.message))
  await P.goto(BASE); await P.locator('.chip-local').first().waitFor()
  await reg(P, 'p@x.co')
  await P.waitForSelector('[data-testid=estado-bloqueado]')
  ok(await P.getByTestId('pase-usar').isVisible(), 'T06 pase: usuario sin reportes ve «Ver este local gratis (1 pase)»')
  ok((await txt(P, '[data-testid=pase-usar]')).includes('1 pase'), 'T06 pase: muestra cuántos pases le quedan')
  await P.locator('.chip-local', { hasText: 'Apolo 11' }).click()
  await P.getByTestId('pase-usar').click()
  await P.getByTestId('pase-confirma').waitFor()
  ok((await txt(P, '[data-testid=pase-confirma]')).includes('Apolo 11'), 'T06 pase: pide confirmación nombrando el local')
  await P.getByRole('button', { name: 'Cancelar' }).click()
  ok((await P.getByTestId('pase-confirma').count()) === 0 && (await P.getByTestId('estado-bloqueado').count()) === 1, 'T06 pase: cancelar no gasta el pase')
  await P.getByTestId('pase-usar').click(); await P.getByTestId('pase-si').click()
  await P.waitForSelector('[data-testid=estado-desbloqueado]')
  ok((await txt(P, '[data-testid=via]')).includes('Pase gratis') && (await txt(P, '[data-testid=estado-aforo]')).includes('Lleno'), 'T06 pase: ve el estado de Apolo 11 (Aforo Lleno) marcado «Pase gratis»')
  await B.getByRole('tab', { name: 'Aforo' }).click()
  await B.locator('.valor[data-valor=bajo]').click()
  await P.waitForFunction(() => document.querySelector('[data-testid=estado-aforo]')?.textContent.includes('Bajo'), null, { timeout: 5000 })
  ok(true, 'T07 pase: con pase también recibe en vivo los cambios de ese local')
  await P.locator('.chip-local', { hasText: 'Cafetería principal' }).click()
  await P.waitForSelector('[data-testid=estado-bloqueado]')
  ok(await P.getByTestId('pase-agotado').isVisible() && (await P.getByTestId('pase-usar').count()) === 0, 'T06 pase: otro local sigue bloqueado y ya no ofrece pase')
  await P.waitForTimeout(21000)
  await P.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await P.locator('.chip-local', { hasText: 'Apolo 11' }).click()
  await P.waitForSelector('[data-testid=estado-bloqueado]', { timeout: 5000 })
  ok((await P.getByTestId('pase-usar').count()) === 0, 'T06 pase: vencido el pase vuelve el bloqueo y no se puede reusar')

  // Fuera de geofence
  const ctxF = await browser.newContext({ viewport: { width: 390, height: 800 }, geolocation: { latitude: 6.2790, longitude: -75.5820, accuracy: 5 }, permissions: ['geolocation'] })
  const F = await ctxF.newPage(); await F.goto(BASE); await F.locator('.chip-local').first().waitFor()
  await reg(F, 'f@x.co')
  await F.getByRole('button', { name: 'Estoy aquí' }).click()
  await F.getByRole('alert').waitFor()
  ok((await txt(F, '[role=alert]')).includes('Acércate'), 'T04 fuera del geofence: mensaje amable')
  ok(await F.getByTestId('accion-checkin').isVisible(), 'T04 fuera del geofence no queda check-in')

  // Permiso denegado (TC-09)
  const ctxD = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const D = await ctxD.newPage(); await D.goto(BASE)
  await D.locator('.chip-local').first().waitFor({ timeout: 9000 })
  ok((await D.locator('.chip-local').count()) === 4, 'T03 TC-09 sin ubicación usa el centro del campus y muestra los locales')
  await reg(D, 'd@x.co')
  await D.waitForSelector('[data-testid=accion-sin-ubicacion]')
  ok((await txt(D, '[data-testid=accion-sin-ubicacion]')).length > 0 && await D.getByRole('button', { name: 'Estoy aquí' }).isDisabled(), 'T04 TC-09 denegado: sin check-in posible y con aviso')

  // Lejos del campus
  const ctxL = await browser.newContext({ viewport: { width: 390, height: 800 }, geolocation: { latitude: -12.04, longitude: -77.03, accuracy: 5 }, permissions: ['geolocation'] })
  const L = await ctxL.newPage(); await L.goto(BASE); await L.locator('.chip-local').first().waitFor()
  ok((await L.locator('.chip-local').count()) === 4 && (await L.locator('.banner').first().innerText()).includes('lejos'), 'T03 lejos del campus: usa campus y avisa')

  // Calibración
  const C = await ctxF.newPage(); await C.goto(BASE.replace('/?', '/?calibrar=1&'))
  ok((await C.locator('body').innerText()).includes('Calibración de locales'), 'T03 ?calibrar=1 muestra la calibración')

  await A.screenshot({ path: '/tmp/e2e/A.png' }); await B.screenshot({ path: '/tmp/e2e/B.png' })
  console.log('Errores de consola:', consola.length ? consola : 'ninguno')
  console.log(fallos ? `${fallos} FALLAS` : 'TODO OK')
  await browser.close()
})().catch(e => { console.error('EXCEPCIÓN', e.message); process.exit(1) })
