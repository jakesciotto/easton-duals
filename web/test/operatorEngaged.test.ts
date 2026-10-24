import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ENGAGEMENT_RECHECK_MS, focusWithoutEngaging, operatorEngaged, useHeldWhileEngaged } from '@/lib/operatorEngaged'

afterEach(() => {
  document.body.innerHTML = ''
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe('an open dialog holds the snapshot unless it opts out by name', () => {
  const settle = async (ms: number) => { await act(async () => { await new Promise(r => setTimeout(r, ms)) }) }

  it('passes a value straight through while nobody is engaged', async () => {
    const { result, rerender } = renderHook(({ v }) => useHeldWhileEngaged(v, 'e1'), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    await settle(0)
    expect(result.current).toBe('b')
  })

  it('holds while engaged and releases the newest arrival on the first free recheck', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const { result, rerender } = renderHook(({ v }) => useHeldWhileEngaged(v, 'e1'), { initialProps: { v: 'a' } })
    await settle(0)
    input.focus()
    rerender({ v: 'b' })
    rerender({ v: 'c' })
    await settle(ENGAGEMENT_RECHECK_MS * 2)
    expect(result.current).toBe('a')

    input.blur()
    await settle(ENGAGEMENT_RECHECK_MS * 2)
    expect(result.current).toBe('c')
  })

  it('commits at once when the subject changes, so one event never shows another one data', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const { result, rerender } = renderHook(
      ({ v, k }) => useHeldWhileEngaged(v, k),
      { initialProps: { v: 'event one', k: 'e1' } },
    )
    await settle(0)
    rerender({ v: 'event two', k: 'e2' })
    expect(result.current).toBe('event two')
  })

  it('never holds the first arrival, which would keep a screen on its loading state', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const { result, rerender } = renderHook(
      ({ v }) => useHeldWhileEngaged(v, 'e1'),
      { initialProps: { v: undefined as string | undefined } },
    )
    rerender({ v: 'first' })
    expect(result.current).toBe('first')
  })

  it('stops rechecking when it unmounts', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const spy = vi.spyOn(globalThis, 'clearInterval')
    const { rerender, unmount } = renderHook(({ v }) => useHeldWhileEngaged(v, 'e1'), { initialProps: { v: 'a' } })
    await settle(0)
    rerender({ v: 'b' })
    await settle(0)
    unmount()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('counts an open dialog, a drag, a focused field and an open listbox as engaged, and a dialog that opts out by name as not', () => {
    const cases: { name: string; html: string; focus?: string; engaged: boolean }[] = [
      { name: 'nothing in progress', html: '', engaged: false },
      { name: 'a tab root mid drag', html: '<div data-dragging="1"></div>', engaged: true },
      { name: 'data-dragging explicitly false', html: '<div data-dragging="false"></div>', engaged: false },
      { name: 'a focused input', html: '<input>', focus: 'input', engaged: true },
      { name: 'a focused select', html: '<select></select>', focus: 'select', engaged: true },
      { name: 'a focused plain button', html: '<button></button>', focus: 'button', engaged: false },
      { name: 'an open dialog', html: '<div data-slot="dialog-content" data-open=""></div>', engaged: true },
      { name: 'a focused app Select trigger', html: '<button data-slot="select-trigger"></button>', focus: 'button', engaged: true },
      { name: 'a dialog that carries the opt out', html: '<div data-slot="dialog-content" data-open="" data-poll-through=""></div>', engaged: false },
      { name: 'a dialog without the opt out beside one with it', html: '<div data-slot="dialog-content" data-open="" data-poll-through=""></div><div role="dialog"></div>', engaged: true },
      { name: 'an open listbox with focus on an item', html: '<div role="listbox"><div role="option" tabindex="0"></div></div>', focus: '[role="option"]', engaged: true },
      { name: 'a closed listbox left in the portal', html: '<div data-closed hidden><div data-slot="select-content" data-closed><div role="listbox"></div></div></div>', engaged: false },
      { name: 'an open listbox beside a closed one', html: '<div data-closed hidden><div role="listbox"></div></div><div role="listbox"></div>', engaged: true },
    ]
    for (const c of cases) {
      document.body.innerHTML = c.html
      if (c.focus) (document.querySelector(c.focus) as HTMLElement).focus()
      expect(operatorEngaged(), c.name).toBe(c.engaged)
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
  })
  const trigger = () => {
    document.body.innerHTML = '<button data-slot="select-trigger"></button>'
    return document.querySelector('button') as HTMLButtonElement
  }

  it('leaves the field the app focused out of the count', () => {
    const el = trigger()
    focusWithoutEngaging(el)
    expect(el).toHaveFocus()
    expect(operatorEngaged()).toBe(false)
  })

  it('ends the grant at the operator first touch of that field', () => {
    const el = trigger()
    focusWithoutEngaging(el)
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    expect(operatorEngaged()).toBe(true)
  })

  it('grants one field at a time', () => {
    const first = trigger()
    focusWithoutEngaging(first)
    const second = document.createElement('input')
    document.body.appendChild(second)
    focusWithoutEngaging(second)
    first.focus()
    expect(operatorEngaged()).toBe(true)
  })
})
