
import { describe, test, expect } from '@jest/globals';
import { Language } from '../modules/language-en-us.mjs';

// Language class is stateless, so we initialize it only once
let lang;

beforeAll( async () => {
    lang = new Language();
    await lang.loadDictionary("./dictionaries/en-us.txt");
});

describe('Word phonemization', () => {
      
    test.each([
        ['', ""],
        ['AND', "ənd"],
        ['MERCHANDISE', 'mˈɜɹʧəndˌIz'],
        ['NOTINDICTIONARY', "nɑtIndɪkʃənɛɹi"],
    ])('phonemizeWord("%s") ➝ %s', async (input, expected) => {
        expect(lang.phonemizeWord(input).join("")).toEqual(expected);
    });

});

describe('Number to words', () => {
  
    test.each([
        ['-1', "MINUS ONE"],
        ['0', "ZERO"],
        ['11', "ELEVEN"],
        ['1000', "ONE THOUSAND"],
        ['-463', "MINUS FOUR SIX THREE"],
        ['12.532', "TWELVE POINT FIVE THREE TWO"],
        ['100', "ONE HUNDRED"],
        ['300', "THREE HUNDRED"],
        ['0.5', "ZERO POINT FIVE"],
        ['-0.25', "MINUS ZERO POINT TWO FIVE"]
    ])('convertNumberToWords("%s") ➝ %s', (input, expected) => {
        expect(lang.convertNumberToWords(input)).toEqual(expected);
    });

});

describe('Part set text', () => {
  
    test.each([
        [
            "THE NUMBER WAS -1,234,567.89.",
            "THE NUMBER WAS MINUS ONE MILLION TWO HUNDRED THIRTY FOUR THOUSAND FIVE HUNDRED SIXTY SEVEN POINT EIGHT NINE."
        ], [
            "I WAS A KID IN THE 70S, A TEENAGER IN THE 1980'S, GOT MARRIED ON THE 1ST OF JUNE.",
            "I WAS A KID IN THE SEVENTIES, A TEENAGER IN THE NINETEEN EIGHTIES, GOT MARRIED ON THE FIRST OF JUNE."
        ], [
            "I CELEBRATED MY 22ND BIRTHDAY IN THE NINETIES, BOUGHT MY HOUSE IN THE 2000S, HAD MY 3RD CHILD ON THE 123RD DAY OF THE YEAR.",
            "I CELEBRATED MY TWENTY SECOND BIRTHDAY IN THE NINETIES, BOUGHT MY HOUSE IN THE TWO THOUSANDS, HAD MY THIRD CHILD ON THE ONE HUNDRED TWENTY THIRD DAY OF THE YEAR."
        ], [
            "I RETIRED ON MY 65TH BIRTHDAY, AND NOW I USE MY IPHONE15 WHILE REMEMBERING THE 1970SWA COMPANY I USED TO WORK FOR.",
            "I RETIRED ON MY SIXTY FIFTH BIRTHDAY, AND NOW I USE MY IPHONE FIFTEEN WHILE REMEMBERING THE NINETEEN SEVENTY SWA COMPANY I USED TO WORK FOR."
        ], [
            "SOME OTHER CASES ARE 1900S, 1800S, 2000S, 2040S, 245TH.",
            "SOME OTHER CASES ARE NINETEEN HUNDREDS, EIGHTEEN HUNDREDS, TWO THOUSANDS, TWENTY FORTIES, TWO HUNDRED FORTY FIFTH."
        ]
    ])('partSetText("%s") ➝ %s', (input, expected) => {
        const part = { type: "text", value: input };
        lang.partSetText( part, 0, [part]);
        expect(part.text).toEqual(expected);
    });

});

describe('Generate data', () => {
 
    test('Text input 1', async () => {
        const lang = new Language();
        await lang.loadDictionary("./dictionaries/en-us.txt");
        const result = lang.generate("I'm just testing.");
        expect(result.phonemes).toEqual(['ˈ', 'I', 'm', ' ', 'ʤ', 'ˈ', 'ʌ', 's', 't', ' ', 't', 'ˈ', 'ɛ', 's', 't', 'ɪ', 'ŋ', '.']);
        expect(result.metadata.words).toEqual(["I'm ", 'just ', 'testing.']);
        expect(result.metadata.wtimes).toEqual( Array(3).fill( expect.any(Number) ) );
        expect(result.metadata.wdurations).toEqual( Array(3).fill( expect.any(Number) ) );
        expect(result.metadata.visemes).toEqual(['I', 'PP', 'CH', 'aa', 'SS', 'DD', 'DD', 'E', 'SS', 'DD', 'I', 'nn']);
        expect(result.metadata.vtimes).toEqual( Array(12).fill( expect.any(Number) ) );
        expect(result.metadata.vdurations).toEqual( Array(12).fill( expect.any(Number) ) );
    });

});
