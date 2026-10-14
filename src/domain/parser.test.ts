import { describe, expect, it } from 'vitest'
import { parseSimilarityList, similarityScore } from './parser'

describe('similarity list parser', () => {
  it('parses brand pipes, permits name-only rows, and ignores blanks', () => {
    expect(parseSimilarityList('Diptyque | Philosykos\n\nPremier Figuier')).toMatchObject([
      { brand: 'Diptyque', name: 'Philosykos' },
      { brand: '', name: 'Premier Figuier' },
    ])
  })

  it('deduplicates normalized identities', () => {
    expect(parseSimilarityList('Dior | Sauvage\n dior|  sauvage ')).toHaveLength(1)
  })

  it('extracts all 20 fragrances from a Portuguese Fragrantica section with blank lines and votes', () => {
    const entries = [
      ['Dior', 'Dior Homme 2020', '1.1k', '254'],
      ['Issey Miyake', 'L\u2019Eau d\u2019Issey pour Homme Vetiver', '255', '131'],
      ['Maison Alhambra', 'Dark Door Sport', '208', '49'],
      ['Frederic Malle Editions de Parfums', 'Uncut Gem', '88', '124'],
      ['Assaf', 'Arrogate Blue De', '24', '8'],
      ['Issey Miyake', "L'Eau d'Issey Pour Homme", '164', '301'],
      ['Loewe', 'Loewe 7 Cobalt', '36', '46'],
      ['Givenchy', 'Gentleman Society Sport', '41', '63'],
      ['Moncler', 'Moncler Sunrise pour Homme', '23', '27'],
      ['Issey Miyake', "L'Eau d'Issey Pour Homme Fraiche", '18', '19'],
      ['Fragrance World', "D'hommes Sport", '12', '7'],
      ['Herm\u00e8s', "Terre d'Herm\u00e8s", '44', '74'],
      ['Dior', 'Dior Homme Sport 2017', '49', '87'],
      ['Arabiyat Prestige', 'Hamdan The Hero', '6', '1'],
      ['Antonio Puig', 'Quorum Silver', '13', '16'],
      ['Herm\u00e8s', "Terre D'Hermes Eau Intense Vetiver", '18', '26'],
      ['Versace', 'Eros Energy', '29', '50'],
      ['Emirates Pride Perfumes', 'Midnight Glow', '4', '0'],
      ['Creed', 'Aventus', '21', '35'],
      ['Tom Ford', 'Costa Azzurra Parfum', '9', '11'],
    ] as const
    const text = ['Este Perfume me Lembra do', 'Sugerir', ...entries.flatMap(
      ([brand, name, up, down]) => [`perfume ${name} ${brand}`, brand, name, up, down, 'Comparar'],
    )].join('\r\n\r\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([brand, name]) => ({ brand, name })),
    )
  })

  it('recognizes translated card titles and non-Latin interface labels', () => {
    const text = [
      '\u042d\u0442\u043e\u0442 \u0430\u0440\u043e\u043c\u0430\u0442 \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u0435\u0442 \u043c\u043d\u0435',
      '\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u0442\u044c',
      '\u0434\u0443\u0445\u0438 Terre d\u2019Herm\u00e8s Herm\u00e8s',
      'Herm\u00e8s', 'Terre d\u2019Herm\u00e8s', '1,1k', '254',
      '\u0421\u0440\u0430\u0432\u043d\u0438\u0442\u044c',
    ].join('\n\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual([
      { brand: 'Herm\u00e8s', name: 'Terre d\u2019Herm\u00e8s' },
    ])
  })

  it('ignores abbreviated vote counts in the Aventus related fragrance list', () => {
    const entries = [
      ['Armaf', 'Club de Nuit Intense Man', '6.1k', '935'],
      ['Montblanc', 'Explorer', '3.9k', '677'],
      ['Al Haramain Perfumes', "L'Aventure", '1.4k', '318'],
      ['Zara', 'Vibrant Leather Eau de Parfum', '1.2k', '228'],
      ['Afnan', 'Supremacy Silver', '1.2k', '293'],
      ['Afnan', 'Supremacy Not Only Intense', '907', '269'],
      ['Creed', 'Aventus Cologne', '826', '208'],
      ['Armaf', 'Club de Nuit Intense Man Limited Edition Parfum', '738', '84'],
      ['Loewe', 'Esencia pour Homme Eau de Parfum', '644', '92'],
      ['Armaf', 'Club de Nuit Intense Man Parfum', '617', '77'],
      ['Tiziana Terenzi', 'Orion', '700', '267'],
      ['Reyane Tradition', 'Insurrection II Pure', '682', '257'],
      ['Creed', 'Absolu Aventus 2023', '657', '212'],
      ['Nishane', 'Hacivat', '1.3k', '1.6k'],
      ['Vilhelm Parfumerie', 'Morning Chess', '608', '178'],
      ['Versace', 'Eros Energy', '699', '495'],
      ['Zara', 'Vibrant Leather', '486', '194'],
      ['Rasasi', 'Rumz Al Rasasi 9325 Pour Lui', '400', '69'],
      ['Fragrance One', 'Office For Men', '504', '323'],
      ['Mancera', 'Cedrat Boise', '1.6k', '2.5k'],
    ]
    const text = ['This perfume reminds me of', 'Suggest', ...entries.flatMap(
      ([brand, name, up, down]) => [`perfume ${name} ${brand}`, brand, name, up, down, 'Compare'],
    )].join('\r\n\r\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([brand, name]) => ({ brand, name })),
    )
  })

  it('preserves abbreviated-count text when it is a fragrance name', () => {
    expect(parseSimilarityList('6.1k')).toMatchObject([{ brand: '', name: '6.1k' }])
    expect(parseSimilarityList('perfume 6.1k Example\nExample\n6.1k\n1.2k\nCompare'))
      .toMatchObject([{ brand: 'Example', name: '6.1k' }])
  })

  it('supports cards without votes and deduplicates cards and manual rows together', () => {
    expect(parseSimilarityList(
      '212\nMontblanc | Explorer\nperfume Explorer Montblanc\nMontblanc\nExplorer\nComparar\nMontblanc | Explorer\nCreed | Aventus\nOther fragrance',
    )).toMatchObject([
      { brand: '', name: '212' },
      { brand: 'Montblanc', name: 'Explorer' },
      { brand: 'Creed', name: 'Aventus' },
      { brand: '', name: 'Other fragrance' },
    ])
  })

  it('preserves numeric and interface-like names in manual lists', () => {
    expect(parseSimilarityList('212\nCompare\nSuggest\nComparar\nSugerir')).toMatchObject([
      { name: '212' }, { name: 'Compare' }, { name: 'Suggest' }, { name: 'Comparar' }, { name: 'Sugerir' },
    ])
  })


  it('parses Parfumo clipboard cards with aliases, concentrations, and Unicode', () => {
    const entries = [
      ['Marwa (Eau de Parfum) / \u0645\u0631\u0648\u0629', 'Arabiyat Prestige', 'Marwa Eau de Parfum'],
      ['Pure Vision', 'C\u00e2line', 'Pure Vision'],
      ['Hawas Kobra / \u0647\u0648\u0633', 'Rasasi', 'Hawas Kobra'],
      ['Marwa (Extrait) / \u0645\u0631\u0648\u0629', 'Arabiyat Prestige', 'Marwa Extrait'],
      ['Citrus Assam / Citrus Ceylon', 'Avapari', 'Citrus Assam'],
      ['#Imagine', 'The Dua Brand', '#Imagine'],
      ["L'Enfant Terrible", 'Givenchy', "L'Enfant Terrible"],
      ['Sunrise on the Red Sand Dunes (Eau de Parfum)', 'Zara', 'Sunrise on the Red Sand Dunes Eau de Parfum'],
      ['Scent 4', 'Mij\u00f5u Fragrances', 'Scent 4'],
    ]
    const text = entries.flatMap(([title, brand, name]) => [`${title} by ${brand}`, name]).join('\r\n\r\n')
    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([, brand, name]) => ({ brand, name })),
    )
  })

  it('extracts the 30 Dior related cards with separate concentrations and ignores following page sections', () => {
    const entries = [
      ['Maison Alhambra', 'Dark Door Sport'],
      ['Issey Miyake', "L'Eau d'Issey pour Homme V\u00e9tiver"],
      ['Dior', 'Dior Homme (2020)', 'Eau de Toilette'],
      ['Moncler', 'Moncler Sunrise pour Homme'],
      ['Fragrance World', "Parfum d'Hommes Sport"],
      ['Louis Vuitton', 'Sur la Route'],
      ['Loewe', '7 Cobalt'],
      ['Editions de Parfums Fr\u00e9d\u00e9ric Malle', 'Uncut Gem'],
      ['Porsche Design', 'Porsche Design Sport'],
      ['Abercrombie & Fitch', 'Authentic Man'],
      ['Amouage', 'Search'],
      ['Louis Vuitton', 'M\u00e9t\u00e9ore'],
      ['Givenchy', 'Gentleman Society', 'Eau de Parfum Sport'],
      ['Louis Vuitton', "L'Immensit\u00e9"],
      ['Issey Miyake', "L'Eau d'Issey pour Homme", 'Eau de Toilette'],
      ['Grauton Parfums', 'Malachitgrau'],
      ['Issey Miyake', "Le Sel d'Issey", 'Eau de Parfum'],
      ['Ex Nihilo', 'Citizen X'],
      ['Dolce & Gabbana', 'D&G Masculine', 'Eau de Toilette'],
      ['Essential Parfums', 'Bois Imp\u00e9rial', 'Eau de Parfum'],
      ['Caron', 'Pour Un Homme de Caron Le Matin'],
      ['Bottega Veneta', 'Illusione', 'Eau de Toilette'],
      ['Kenzo', "L'Eau Kenzo Bois\u00e9e"],
      ['Versace', 'Eros Energy'],
      ['Dior', 'Dior Homme Sport (2012)', 'Eau de Toilette'],
      ['Dior', 'Dior Homme Sport (2017)'],
      ['Dior', 'Sauvage Elixir'],
      ['Mancera', 'Cedrat Boise'],
      ['Giorgio Armani', 'Acqua di Gi\u00f2 Profumo', 'Parfum'],
      ['Fragrance One', 'Office for Men'],
    ]
    const text = [
      ...entries.flatMap(([brand, name, concentration]) => [
        `${name}${concentration ? ` (${concentration})` : ''} by ${brand}`,
        name,
        ...(concentration ? [concentration] : []),
      ]),
      'Reviews', '89 in-depth fragrance descriptions',
      'Popular', '06/23/2024', '9.5', 'Scent', '6', 'Longevity', '6', 'Sillage',
      'Smirky', '670 Reviews', 'Awesome sporty masculine fragrance',
      'Dior Homme Sport is an awesome, fresh and sporty masculine fragrance.',
      'Statements', '315 short views on the fragrance',
      'Charts', 'This is how the community classifies the fragrance.',
      'Images', '35 fragrance photos of the community',
      'Popular by Dior', 'Dior Homme Intense (2011) by Dior', 'Dior Homme Intense (2011)',
      'Also liked', 'Naxos by Xerjoff', 'Naxos',
    ].join('\r\n\r\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([brand, name, concentration]) => ({
        brand, name: `${name}${concentration ? ` ${concentration}` : ''}`,
      })),
    )
  })

  it('applies a trailing concentration to each alias in a Parfumo card', () => {
    const text = [
      'Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis',
      'Tuscany per Uomo\u00a0Eau de Toilette',
      'Stand In by Omerta',
      'Stand In',
      'Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis',
      'Etruscan Eau de Toilette',
      'L.12.12 Blanc / Eau de Lacoste L.12.12 Blanc (Eau de Toilette) by Lacoste',
      'L.12.12 Blanc',
      'Eau de Toilette',
    ].join('\n')
    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual([
      { brand: 'Aramis', name: 'Tuscany per Uomo\u00a0Eau de Toilette' },
      { brand: 'Omerta', name: 'Stand In' },
      { brand: 'Aramis', name: 'Etruscan Eau de Toilette' },
      { brand: 'Lacoste', name: 'L.12.12 Blanc Eau de Toilette' },
    ])
  })

  it('keeps the 30 Azzaro related names in order without adding a Tuscany title row', () => {
    const names = [
      'Azzaro pour Homme\u00a0After Shave Lotion',
      'Azzaro pour Homme\u00a0Eau de Toilette Intense',
      "Azzaro pour Homme L'Eau",
      'Azzaro pour Homme Summer 2015',
      'Tuscany per Uomo\u00a0Eau de Toilette',
      'Stand In',
      'Azzaro pour Homme Summer 2014',
      'Paco Rabanne pour Homme\u00a0Eau de Toilette',
      'Azzaro pour Homme Intense',
      'Sandalo\u00a0Eau de Parfum',
      'Aramis\u00a0Eau de Toilette',
      'Marbert Man Classic\u00a0Eau de Toilette',
      'Un Homme\u00a0Eau de Toilette',
      'Le Tour de France',
      'Moschino pour Homme\u00a0Eau de Toilette',
      'Masculin Acier\u00a0Eau de Toilette',
      'Azzaro pour Homme Edition Noire',
      'Absinth\u00a0Extrait de Parfum',
      'Red for Men\u00a0Eau de Toilette',
      "L'Immensit\u00e9",
      'Pure Cedrat',
      'Raysuli',
      'Brut 33\u00a0Cologne',
      'Cuba Black\u00a0Eau de Toilette',
      'Lagerfeld Classic\u00a0Eau de Toilette',
      'Rive Gauche pour Homme (2003)\u00a0Eau de Toilette',
      'Polo\u00a0Eau de Toilette',
      'No. 7',
      'Attimo',
      'Mezzo',
    ]
    expect(parseSimilarityList(names.join('\n')).map(({ name }) => name)).toEqual(names)
    const clipboard = [...names]
    clipboard.splice(4, 0, 'Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis')
    const rows = parseSimilarityList(clipboard.join('\r\n'))
    expect(rows.map(({ name }) => name)).toEqual(names)
    expect(rows[4].brand).toBe('Aramis')
  })

  it('does not consume a different concentration or an unrelated following name', () => {
    expect(parseSimilarityList([
      'Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis',
      'Tuscany per Uomo Eau de Parfum',
      'Dior Homme (2020) (Eau de Toilette) by Dior',
      'Dior Homme (2020)',
      'Eau de Parfum',
      'Somebody by Night',
      'Other fragrance',
    ].join('\n'))).toMatchObject([
      { brand: '', name: 'Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis' },
      { brand: '', name: 'Tuscany per Uomo Eau de Parfum' },
      { brand: '', name: 'Dior Homme (2020) (Eau de Toilette) by Dior' },
      { brand: '', name: 'Dior Homme (2020)' },
      { brand: '', name: 'Eau de Parfum' },
      { brand: '', name: 'Somebody by Night' },
      { brand: '', name: 'Other fragrance' },
    ])
  })

  it('deduplicates Parfumo cards with manual entries and preserves unrelated rows', () => {
    expect(parseSimilarityList('Pure Vision by Caline\nPure Vision\nCaline | Pure Vision\nOther fragrance\nReviews'))
      .toMatchObject([
        { brand: 'Caline', name: 'Pure Vision' }, { brand: '', name: 'Other fragrance' }, { brand: '', name: 'Reviews' },
      ])
    expect(parseSimilarityList('Somebody by Night\nOther fragrance')).toMatchObject([
      { brand: '', name: 'Somebody by Night' }, { brand: '', name: 'Other fragrance' },
    ])
  })

  it('only offers fuzzy similarity as a score, never an identity decision', () => {
    expect(similarityScore('Dior Sauvage', 'Dior Sauvage EDP')).toBeGreaterThan(0.7)
    expect(similarityScore('Dior Sauvage', 'Guerlain Shalimar')).toBeLessThan(0.5)
  })
})
