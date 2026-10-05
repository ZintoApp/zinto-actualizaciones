import type { CustomJsSettings } from '@shared/customization-settings';

// Removing a script tag cannot revoke its timers, listeners, or global patches.
let executedCompanyCustomJs = false;
export function hasExecutedCompanyCustomJs() { return executedCompanyCustomJs; }

export type CustomCssSource = 'app' | 'company';

export interface CompanyScopedCustomizationUser {
  companyId?: number | null;
  isSuperAdmin?: boolean | null;
}

export function shouldLoadCompanyScopedCustomization(user?: CompanyScopedCustomizationUser | null) {
  return Boolean(user && user.companyId && !user.isSuperAdmin);
}

export function removeCustomCss(doc: Document, source: CustomCssSource) {
  Array.from(doc.querySelectorAll(`style[data-custom-css="${source}"]`)).forEach((style) => {
    style.parentNode?.removeChild(style);
  });
}

export function upsertCustomCss(doc: Document, css: string, source: CustomCssSource) {
  removeCustomCss(doc, source);

  if (!css.trim()) {
    return null;
  }

  const styleElement = doc.createElement('style');
  styleElement.setAttribute('data-custom-css', source);
  styleElement.textContent = css;
  doc.head.appendChild(styleElement);
  return styleElement;
}

export function removeCompanyCustomJs(doc: Document) {
  Array.from(doc.querySelectorAll('[data-company-custom-js="true"]')).forEach((element) => {
    element.parentNode?.removeChild(element);
  });
}

function shouldTreatCompanyCustomJsAsMarkup(js: string) {
  return /<script\b|<\/?[a-z][a-z0-9:-]*\b[^>]*>/i.test(js);
}

function injectInlineCompanyCustomJs(doc: Document, js: string) {
  const scriptElement = doc.createElement('script');
  scriptElement.setAttribute('type', 'text/javascript');
  scriptElement.setAttribute('data-company-custom-js', 'true');
  scriptElement.textContent = js;
  doc.head.appendChild(scriptElement);
  return [scriptElement];
}

function injectCompanyCustomJsMarkup(doc: Document, markup: string) {
  const tempContainer = doc.createElement('div');
  tempContainer.innerHTML = markup;

  const injectedElements: Element[] = [];

  Array.from(tempContainer.children).forEach((element) => {
    if (element.tagName.toLowerCase() === 'script') {
      const newScript = doc.createElement('script');

      element.getAttributeNames().forEach((attributeName) => {
        const attributeValue = element.getAttribute(attributeName);
        if (attributeValue !== null) {
          newScript.setAttribute(attributeName, attributeValue);
        }
      });

      if (!element.getAttribute('src')) {
        newScript.textContent = element.textContent;
      }

      newScript.setAttribute('data-company-custom-js', 'true');
      doc.head.appendChild(newScript);
      injectedElements.push(newScript);
      return;
    }

    const clonedElement = element.cloneNode(true) as Element;
    clonedElement.setAttribute('data-company-custom-js', 'true');
    (doc.body ?? doc.head).appendChild(clonedElement);
    injectedElements.push(clonedElement);
  });

  return injectedElements;
}

export function syncCompanyCustomJs(doc: Document, settings?: CustomJsSettings | null) {
  removeCompanyCustomJs(doc);

  const js = settings?.js || '';

  if (!settings?.enabled || !js.trim()) {
    return null;
  }

  executedCompanyCustomJs = true;
  try {
    if (shouldTreatCompanyCustomJsAsMarkup(js)) {
      const injectedMarkup = injectCompanyCustomJsMarkup(doc, js);
      if (injectedMarkup.length > 0) {
        return injectedMarkup;
      }
    }

    return injectInlineCompanyCustomJs(doc, js);
  } catch (error) {
    console.error('Error injecting company custom JavaScript:', error);
    return null;
  }
}