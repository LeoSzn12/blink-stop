import { formatScore } from './share.mjs';

export function appendScore(list, entry, index, mode, document) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    const score = document.createElement('span');
    name.textContent = `#${index + 1} ${entry.name}`;
    score.textContent = formatScore(mode, entry.score);
    li.append(name, score);
    list.appendChild(li);
}
