import fs from 'fs';

const path = 'src/index.css';
let css = fs.readFileSync(path, 'utf8');

// Drop host-global :root / html / body rules (vars already live on .odontogram-root)
css = css.replace(/:root\s*\{[\s\S]*?\}\s*/m, '');
css = css.replace(/\*\{box-sizing:border-box\}\s*/, '');
css = css.replace(/html,body\{[^}]*\}\s*/, '');
css = css.replace(/body\{[\s\S]*?\}\s*/m, '');

const rootExtras = `.odontogram-root, .odontogram-root *{box-sizing:border-box}
.odontogram-root{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  min-height: 100%;
}
`;

const darkMatch = css.match(/\.dark \.odontogram-root\{[\s\S]*?\}/);
if (!darkMatch) throw new Error('dark odontogram-root block not found');
const insertAt = css.indexOf(darkMatch[0]) + darkMatch[0].length;
css = css.slice(0, insertAt) + '\n' + rootExtras + css.slice(insertAt);

function prefixSelector(sel) {
    const s = sel.trim();
    if (!s) return s;
    if (s.startsWith('@')) return s;
    if (s.includes('.odontogram-root')) return s;
    if (s.startsWith(':root')) return s;
    if (s.startsWith(':')) return '.odontogram-root' + s;
    return '.odontogram-root ' + s;
}

function prefixRuleSelectors(selectorList) {
    return selectorList.split(',').map(prefixSelector).join(', ');
}

function prefixBlock(inner) {
    let o = '';
    let k = 0;
    const text = inner;
    while (k < text.length) {
        if (/\s/.test(text[k])) {
            o += text[k++];
            continue;
        }
        if (text.startsWith('/*', k)) {
            const end = text.indexOf('*/', k);
            o += text.slice(k, end + 2);
            k = end + 2;
            continue;
        }
        if (text[k] === '@') {
            const start = k;
            while (k < text.length && text[k] !== '{' && text[k] !== ';') k++;
            if (text[k] === ';') {
                o += text.slice(start, k + 1);
                k++;
                continue;
            }
            const header = text.slice(start, k);
            let depth = 0;
            let j = k;
            for (; j < text.length; j++) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') {
                    depth--;
                    if (depth === 0) {
                        j++;
                        break;
                    }
                }
            }
            o += header + text.slice(k, j);
            k = j;
            continue;
        }
        const selStart = k;
        while (k < text.length && text[k] !== '{') k++;
        const selectors = text.slice(selStart, k);
        let depth = 0;
        let j = k;
        for (; j < text.length; j++) {
            if (text[j] === '{') depth++;
            else if (text[j] === '}') {
                depth--;
                if (depth === 0) {
                    j++;
                    break;
                }
            }
        }
        o += prefixRuleSelectors(selectors) + text.slice(k, j);
        k = j;
    }
    return o;
}

let out = '';
let i = 0;
while (i < css.length) {
    if (/\s/.test(css[i])) {
        out += css[i++];
        continue;
    }
    if (css.startsWith('/*', i)) {
        const end = css.indexOf('*/', i);
        out += css.slice(i, end + 2);
        i = end + 2;
        continue;
    }
    if (css[i] === '@') {
        const start = i;
        while (i < css.length && css[i] !== '{' && css[i] !== ';') i++;
        if (css[i] === ';') {
            out += css.slice(start, i + 1);
            i++;
            continue;
        }
        const header = css.slice(start, i);
        const isKeyframes = /@keyframes\b/i.test(header);
        let depth = 0;
        let j = i;
        for (; j < css.length; j++) {
            if (css[j] === '{') depth++;
            else if (css[j] === '}') {
                depth--;
                if (depth === 0) {
                    j++;
                    break;
                }
            }
        }
        const block = css.slice(i, j);
        if (isKeyframes) {
            out += header + block;
        } else {
            const inner = block.slice(1, -1);
            out += header + '{' + prefixBlock(inner) + '}';
        }
        i = j;
        continue;
    }
    const selStart = i;
    while (i < css.length && css[i] !== '{') i++;
    const selectors = css.slice(selStart, i);
    let depth = 0;
    let j = i;
    for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') {
            depth--;
            if (depth === 0) {
                j++;
                break;
            }
        }
    }
    const body = css.slice(i, j);
    out += prefixRuleSelectors(selectors) + body;
    i = j;
}

fs.writeFileSync(path, out);
console.log('scoped', path, 'bytes', out.length);
console.log('has :root?', /:root\s*\{/.test(out));
console.log('has bare body{?', /(^|\n)body\{/.test(out));
console.log('has bare select{?', /(^|\n)select\{/.test(out));
console.log('has bare .btn{?', /(^|\n)\.btn\{/.test(out));
console.log('scoped select count', (out.match(/\.odontogram-root select/g) || []).length);
console.log('scoped .btn count', (out.match(/\.odontogram-root \.btn/g) || []).length);