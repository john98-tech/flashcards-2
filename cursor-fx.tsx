'use client'

import { useEffect, useRef } from 'react'
import { Grab, Hand } from 'lucide-react'

const INTERACTIVE = 'button, a, [role="button"], summary, label, select'

export function CursorFx() {
  const layerRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    if (!layer || !ring || !dot) return
    if (!matchMedia('(pointer: fine)').matches) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let x = -100, y = -100
    let rx = x, ry = y, rw = 36, rh = 36, rr = 18
    let tx = x, ty = y, tw = 36, th = 36, tr = 18
    let magnet: Element | null = null
    let visible = false
    let raf = 0
    const root = document.documentElement

    // Hit-test from the real pointer position (not e.target) so it stays correct
    // during pointer capture (box-select), after scroll, and when modals open/close.
    const refresh = () => {
      if (!visible) return
      const el = document.elementFromPoint(x, y)
      const hit = el?.closest?.(INTERACTIVE) ?? null
      const card = el?.closest?.('[data-card-id]') ?? null
      const field = el?.closest?.('input, textarea, [contenteditable="true"]') ?? null
      const dragging = document.body.dataset.dragging === 'true'
      // magnetic only on small buttons/links
      if (hit && !card) {
        const r = hit.getBoundingClientRect()
        magnet = r.width < 260 && r.height < 90 ? hit : null
      } else magnet = null
      const grab = !!card && !hit && !field && !dragging
      ring.dataset.active = String(!!hit)
      ring.dataset.grab = String(grab)
      ring.dataset.grabbing = String(dragging)
      // native text caret is shown over fields, so keep our dot hidden there
      dot.dataset.hide = String(!!magnet || grab || dragging || !!field)
    }

    const onMove = (e: PointerEvent | DragEvent) => {
      if ('pointerType' in e) {
        if (e.pointerType !== 'mouse') return
        // A real pointermove never fires during a native drag, so a move with no
        // button pressed means any "dragging" / "pressed" state left behind (drag
        // ended on a removed element, menu swallowed pointerup…) is stale. Clear it
        // so the ring/dot can't get stuck in grab mode or hidden.
        if (e.buttons === 0) {
          ring.dataset.down = 'false'
          if (document.body.dataset.dragging === 'true') delete document.body.dataset.dragging
        }
      }
      x = e.clientX
      y = e.clientY
      if (!visible) {
        visible = true
        rx = tx = x
        ry = ty = y
        ring.style.opacity = '1'
        dot.style.opacity = '1'
        root.classList.add('cursor-fx-on') // hide native cursor only now
      }
      refresh()
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      ring.dataset.down = 'true'
      const ripple = document.createElement('span')
      ripple.className = 'cursor-ripple'
      ripple.style.left = `${e.clientX}px`
      ripple.style.top = `${e.clientY}px`
      ripple.addEventListener('animationend', () => ripple.remove())
      layer.appendChild(ripple)
    }
    const onUp = () => {
      ring.dataset.down = 'false'
      // let React clear body[data-dragging] first, then re-evaluate
      requestAnimationFrame(refresh)
    }
    const onLeave = () => {
      ring.dataset.down = 'false'
      visible = false
      ring.style.opacity = '0'
      dot.style.opacity = '0'
      root.classList.remove('cursor-fx-on') // give the native cursor back
    }
    // mouseleave on `document` is unreliable; mouseout with no relatedTarget = left the window
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) onLeave()
    }

    const loop = () => {
      if (!visible) {
        raf = requestAnimationFrame(loop)
        return
      }
      if (magnet && magnet.isConnected) {
        const r = magnet.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        tx = cx + (x - cx) * 0.15
        ty = cy + (y - cy) * 0.15
        tw = r.width + 12
        th = r.height + 10
        tr = Math.min(th / 2, 14)
      } else {
        tx = x
        ty = y
        tw = th = 36
        tr = 18
      }
      rx += (tx - rx) * 0.22
      ry += (ty - ry) * 0.22
      rw += (tw - rw) * 0.25
      rh += (th - rh) * 0.25
      rr += (tr - rr) * 0.25
      ring.style.width = `${rw}px`
      ring.style.height = `${rh}px`
      ring.style.borderRadius = `${rr}px`
      ring.style.transform = `translate3d(${rx - rw / 2}px, ${ry - rh / 2}px, 0)`
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    // capture phase (true) so components calling e.stopPropagation() (context menu,
    // modals…) can't swallow the events and freeze the ring / ripple / down state
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('dragover', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('contextmenu', onUp, true) // no pointerup follows a right-click menu
    window.addEventListener('drop', onUp, true)
    window.addEventListener('dragend', onUp, true)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('blur', onLeave)
    document.addEventListener('mouseout', onOut)
    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('cursor-fx-on')
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('dragover', onMove, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('contextmenu', onUp, true)
      window.removeEventListener('drop', onUp, true)
      window.removeEventListener('dragend', onUp, true)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('mouseout', onOut)
    }
  }, [])

  return (
    <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      <div ref={ringRef} className="cursor-ring" data-active="false" data-down="false" data-grab="false" data-grabbing="false">
        <Hand className="ic-hand" />
        <Grab className="ic-grab" />
      </div>
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
