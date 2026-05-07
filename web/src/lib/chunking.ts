/**
 * Função para processar e limpar o texto extraído (ex: PDF)
 * Remove hifenizações quebradas, normaliza espaços e quebras de linha para a IA ler melhor.
 */
export function cleanChunkText(rawText: string): string {
  let text = rawText;

  // 1. Remove hifenização de quebra de linha (ex: "comuni-\ncação" -> "comunicação")
  text = text.replace(/([a-záéíóúçãõ])-\s*\n\s*([a-záéíóúçãõ])/gi, '$1$2');

  // 2. Transforma múltiplas quebras de linha em apenas duas (parágrafo)
  text = text.replace(/\n{3,}/g, '\n\n');

  // 3. Remove quebras de linha únicas que estão no meio de frases, substituindo por espaço.
  // Preserva quebras duplas (parágrafos).
  const paragraphs = text.split(/\n\n/);
  const cleanedParagraphs = paragraphs.map(p => {
    // Troca \n sozinho por espaço
    return p.replace(/(?<!\n)\n(?!\n)/g, ' ').trim();
  });
  
  // 4. Junta os parágrafos novamente
  text = cleanedParagraphs.filter(p => p.length > 0).join('\n\n');

  // 5. Remove espaços múltiplos
  text = text.replace(/[ \t]{2,}/g, ' ');

  return text.trim();
}

/**
 * Função inteligente de Chunking (Fatiamento)
 * Evita cortar palavras no meio, buscando pontuações ou espaços para quebrar e para sobrepor.
 */
export function chunkTextSmart(text: string, maxChunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let currentStart = 0;

  while (currentStart < text.length) {
    let currentEnd = currentStart + maxChunkSize;
    
    // Se o fim passar do tamanho do texto, pega o resto e encerra
    if (currentEnd >= text.length) {
      chunks.push(text.slice(currentStart).trim());
      break;
    }

    // Tenta encontrar um bom ponto de quebra ANTES do limite maxChunkSize
    // Prioridade: 1. Parágrafo (\n\n) 2. Ponto final/Exclamação/Interrogação 3. Espaço em branco
    let breakPoint = currentEnd;
    
    const paragraphBreak = text.lastIndexOf('\n\n', currentEnd);
    if (paragraphBreak > currentStart + (maxChunkSize / 2)) {
      breakPoint = paragraphBreak;
    } else {
      // Tenta quebrar em final de frase
      const sentenceBreak = Math.max(
        text.lastIndexOf('. ', currentEnd),
        text.lastIndexOf('? ', currentEnd),
        text.lastIndexOf('! ', currentEnd)
      );
      if (sentenceBreak > currentStart + (maxChunkSize / 2)) {
        breakPoint = sentenceBreak + 1; // Inclui a pontuação
      } else {
        // Fallback: quebra no último espaço em branco
        const spaceBreak = text.lastIndexOf(' ', currentEnd);
        if (spaceBreak > currentStart) {
          breakPoint = spaceBreak;
        }
      }
    }

    const chunkContent = text.slice(currentStart, breakPoint).trim();
    if (chunkContent.length > 0) {
      chunks.push(chunkContent);
    }
    
    // Calcula onde o PRÓXIMO chunk vai começar baseado no overlap (sobreposição)
    // Volta `overlap` caracteres a partir do breakPoint
    let nextStart = breakPoint - overlap;
    
    // Proteção contra loops infinitos
    if (nextStart <= currentStart) {
       nextStart = currentStart + 1;
    }

    // AJUSTE CRÍTICO: Avança o nextStart até o próximo espaço em branco ou início de frase 
    // para não começar o próximo chunk no meio de uma palavra cortada!
    if (nextStart > 0 && nextStart < text.length) {
      const nextSpace = text.indexOf(' ', nextStart);
      if (nextSpace !== -1 && nextSpace < breakPoint) {
        nextStart = nextSpace + 1;
      }
    }

    currentStart = nextStart;
  }

  // Retorna apenas chunks com conteúdo útil
  return chunks.filter(c => c.length > 50);
}
