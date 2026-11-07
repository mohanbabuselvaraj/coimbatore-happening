import { isUiCase } from './ui-lab-contract';

/** Development test chrome communicates with the unchanged product UI. */
export function attachUiLab(setCase: (value: string) => void) {
  const original = document.documentElement.style.fontSize;
  const message = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'ui-lab-case' && isUiCase(event.data.mode)) setCase(event.data.mode);
    if (event.data?.type === 'ui-lab-text') document.documentElement.style.fontSize = event.data.scale === 200 ? '32px' : original;
  };
  addEventListener('message', message);
  parent.postMessage({type:'ui-lab-ready'}, location.origin);
  return () => { removeEventListener('message', message); document.documentElement.style.fontSize = original; };
}
