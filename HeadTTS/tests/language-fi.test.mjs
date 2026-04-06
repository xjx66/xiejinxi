
import { describe, test, expect } from '@jest/globals';
import { Language } from '../modules/language-fi.mjs';

// Language class is stateless, so we initialize it only once
let lang;

beforeAll( async () => {
    lang = new Language();
    await lang.loadDictionary("./dictionaries/fi.txt");
});

describe('Compound words', () => {
      
    test.each([
        ['', ['']],
        ['LUMIUKKO', ["LUMI","UKKO"]],
        ['KUORMA-AUTO', ["KUORMA-","AUTO"]],
        ['JÄÄHYAITIO', ["JÄÄHY","AITIO"]],
        ['AINEENVAIHDUNTAHÄIRIÖ', ["AINEEN","VAIHDUNTA", "HÄIRIÖ"]],
        ['LUMIKKO', ["LUMIKKO"]],
    ])('splitOnCompoundWords("%s") ➝ %j', (input, expected) => {
        expect(lang.splitOnCompoundWords(input)).toEqual(expected);
    });

});

describe('Syllabification', () => {
      
    test.each([
        ['', []],
        ['OJA', ["O", "JA"]],
        ['LUMIKKO', ["LU", "MIK","KO"]],
        ['JÄRJESTELMÄLLISTYTTÄMÄTTÖMYYDELLÄÄNSÄKÄÄN', ["JÄR", "JES", "TEL", "MÄL", "LIS", "TYT", "TÄ", "MÄT", "TÖ", "MYY", "DEL", "LÄÄN", "SÄ", "KÄÄN"]],
    ])('splitOnSyllables("%s") ➝ %j', (input, expected) => {
        expect(lang.splitOnSyllables(input)).toEqual(expected);
    });

});

describe('Stress', () => {
      
    test.each([
        ['', []],
        ['OJA', ['OJA']],
        ['LUMIKKO', ["LUMIKKO"]],
        ['JÄRJESTELMÄLLISTYTTÄMÄTTÖMYYDELLÄÄNSÄKÄÄN', ["JÄRJES", "TELMÄL", "LISTYT", "TÄMÄT", "TÖMYY", "DELLÄÄN", "SÄKÄÄN"]],
    ])('splitOnStress("%s") ➝ %j', (input, expected) => {
        expect(lang.splitOnStress(input)).toEqual(expected);
    });

});

describe('Word phonemization', () => {
      
    test.each([
        ['', ""],
        ['JA', "ˈjɑ"],
        ['LUMIKKO', "ˈlumikːo"],
        ['LUMIUKKO', "ˈlumiˌukːo"],
        ['JÄÄHYAITIO', "ˈjæːhyˌɑitio"],
        ['KEHITYSYHTEISTYÖ', "ˈkehitysˌyhteisˌtyø"],
    ])('phonemizeWord("%s") ➝ %s', (input, expected) => {
        expect(lang.phonemizeWord(input).join("")).toEqual(expected);
    });

});

describe('Number to words', () => {
      
    test.each([
        ['-1', "MIINUS YKSI"],
        ['0', "NOLLA"],
        ['11', "YKSITOISTA"],
        ['1000', "TUHAT"],
        ['-463', "MIINUS NELJÄSATAAKUUSIKYMMENTÄKOLME"],
        ['12.5', "KAKSITOISTA PILKKU VIISI"],
    ])('convertNumberToWords("%s") ➝ %s', (input, expected) => {
        expect(lang.convertNumberToWords(input)).toEqual(expected);
    });

});

describe('Generate data', () => {
      
    test('Text input 1', () => {
        const result = lang.generate('Tämä on testilause.');
        expect(result.phonemes).toEqual(["ˈ","t","æ","m","æ"," ","ˈ","o","n"," ","ˈ","t","e","s","t","i","ˌ","l","ɑ","u","s","e",".",]);
        expect(result.metadata.words).toEqual(['Tämä ','on ','testilause.']);
        expect(result.metadata.wtimes).toEqual( Array(3).fill( expect.any(Number) ) );
        expect(result.metadata.wdurations).toEqual( Array(3).fill( expect.any(Number) ) );
        expect(result.metadata.visemes).toEqual(['DD', 'aa', 'PP', 'aa', 'O', 'nn', 'DD', 'E', 'SS', 'DD', 'I', 'RR', 'aa', 'U', 'SS', 'E']);
        expect(result.metadata.vtimes).toEqual( Array(16).fill( expect.any(Number) ) );
        expect(result.metadata.vdurations).toEqual( Array(16).fill( expect.any(Number) ) );
    });

});
