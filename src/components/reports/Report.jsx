'use client';

import { useState } from 'react';
import { defaultValidator } from 'react-querybuilder';
import 'react-querybuilder/dist/query-builder.css';
import './styles.css';
import dynamic from 'next/dynamic';
import { defaultOperators, toFullOption } from 'react-querybuilder';
import { Box, Tab, Tabs, Typography } from '@mui/material';

// To fix server side renddering hydration error
const QueryBuilder = dynamic(
  () => import('react-querybuilder').then((mod) => mod.QueryBuilder),
  { ssr: false }
);

export const musicalInstruments = [
  {
    label: 'Percussion instruments',
    instruments: [
      'Clapstick',
      'Cowbell',
      'Cymbal',
      'Gong',
      'Maraca',
      'Marimba',
      'More cowbell',
      'Spoon',
      'Steelpan',
      'Tambourine',
      'Triangle',
      'Vibraphone',
      'Washboard',
      'Wood block',
      'Wooden fish',
      'Xylophone',
    ],
  },
  {
    label: 'Membranophones',
    instruments: [
      'Barrel drum',
      'Bass drum',
      'Bongo drums',
      'Conga',
      'Drum',
      'Drum kit',
      "Jew's harp",
      'Octaban',
      'Samphor',
      'Snare drum',
      'Timpani',
      'Tom-tom',
    ],
  },
  {
    label: 'Wind instruments',
    instruments: [
      'Accordion',
      'Air horn',
      'Bagpipe',
      'Baritone horn',
      'Bassoon',
      'Bazooka',
      'Beatboxing',
      'Blown bottle',
      'Bugle',
      'Clarinet',
      'Conch',
      'Cornet',
      'Didgeridoo',
      'Double bell euphonium',
      'Doulophone',
      'English horn',
      'Euphonium',
      'Flugelhorn',
      'Flute',
      'French horn',
      'Harmonica',
      'Irish flute',
      'Jug',
      'Kazoo',
      'Melodeon',
      'Mezzo-soprano',
      'Oboe',
      'Ocarina',
      'Pan flute',
      'Piccolo',
      'Pipe organ',
      'Recorder',
      'Saxophone',
      'Slide whistle',
      'Sousaphone',
      'Trombone',
      'Trumpet',
      'Tuba',
      'Whistle',
    ],
  },
  {
    label: 'Stringed instruments',
    instruments: [
      'Aeolian harp',
      'Bandolin',
      'Banjo ukulele',
      'Cello',
      'Chapman stick',
      'Clavichord',
      'Clavinet',
      'Double bass',
      'Dulcimer',
      'Fiddle',
      'Guitar',
      'Hammered dulcimer',
      'Harp',
      'Harpsichord',
      'Lute',
      'Lyre',
      'Maguhu',
      'Mandola',
      'Mandolin',
      'Octobass',
      'Piano',
      'Sitar',
      'Ukulele',
      'Viol',
      'Violin',
      'Washtub bass',
    ],
  },
  {
    label: 'Electronic instruments',
    instruments: [
      'AlphaSphere',
      'Audiocubes',
      'Bass pedals',
      'Continuum Fingerboard',
      'Croix Sonore',
      "Denis d'or",
      'Dubreq stylophone',
      'Drum machine',
      'Eigenharp',
      'Electric guitar',
      'Electronic keyboard',
      'Electronic organ',
      'EWI',
      'Fingerboard synthesizer',
      'Hammond organ',
      'Keyboard',
      'Keytar',
      'Kraakdoos',
      'Laser harp',
      'Mellotron',
      'MIDI keyboard',
      'Omnichord',
      'Ondes Martenot',
      'Otamatone',
      'Sampler',
      'Seaboard music instrument',
      'Skoog',
      'Synclavier',
      'Synthesizer',
      'Teleharmonium',
      'Tenori-on',
      'Theremin',
      'trautonium',
      'Turntablism',
      'Turntable',
    ],
  },
].map(({ label, instruments }) => ({
  label,
  options: instruments.map((s) => ({
    name: s.toLowerCase().replace(/\s+/g, '_'),
    label: s,
  })),
}));

export const validator = (r) => !!r.value;
export const fields = (
  [
    {
      name: 'firstName',
      label: 'First Name',
      placeholder: 'Enter first name',
      validator,
    },
    {
      name: 'lastName',
      label: 'Last Name',
      placeholder: 'Enter last name',
      defaultOperator: 'beginsWith',
      validator,
    },
    { name: 'age', label: 'Age', inputType: 'number', validator },
    {
      name: 'isMusician',
      label: 'Is a musician',
      valueEditorType: 'checkbox',
      operators: defaultOperators.filter((op) => op.name === '='),
      defaultValue: false,
    },
    {
      name: 'instrument',
      label: 'Primary instrument',
      valueEditorType: 'select',
      values: musicalInstruments,
      // This must be commented out to properly demonstrate `autoSelectValue={false}`
      // defaultValue: 'Cowbell',
      operators: defaultOperators.filter((op) => op.name === '='),
    },
    {
      name: 'alsoPlays',
      label: 'Also plays',
      valueEditorType: 'multiselect',
      values: musicalInstruments,
      defaultValue: 'more_cowbell',
      operators: defaultOperators.filter((op) => op.name === 'in'),
    },
    {
      name: 'tourStops',
      label: 'Tour stops',
      matchModes: true,
      subproperties: [
        { name: 'city', label: 'City' },
        { name: 'state', label: 'State/Province' },
        { name: 'venue', label: 'Venue' },
        { name: 'date', label: 'Date', inputType: 'date', datatype: 'date' },
        { name: 'country', label: 'Country' },
      ],
    },
    {
      name: 'gender',
      label: 'Gender',
      operators: defaultOperators.filter((op) => op.name === '='),
      valueEditorType: 'radio',
      values: [
        { name: 'M', label: 'Male' },
        { name: 'F', label: 'Female' },
        { name: 'O', label: 'Other' },
      ],
    },
    { name: 'height', label: 'Height', validator },
    { name: 'job', label: 'Job', validator },
    { name: 'description', label: 'Description', valueEditorType: 'textarea' },
    {
      name: 'birthdate',
      label: 'Birth Date',
      inputType: 'date',
      datatype: 'date',
    },
    {
      name: 'datetime',
      label: 'Show Time',
      inputType: 'datetime-local',
      datatype: 'timestamp with time zone',
    },
    { name: 'alarm', label: 'Daily Alarm', inputType: 'time' },
    { name: 'bign', label: 'Big Int', inputType: 'bigint' },
    {
      name: 'groupedField1',
      label: 'Grouped Field 1',
      comparator: 'groupNumber',
      groupNumber: 'group1',
      valueSources: ['field', 'value'],
    },
    {
      name: 'groupedField2',
      label: 'Grouped Field 2',
      comparator: 'groupNumber',
      groupNumber: 'group1',
      valueSources: ['field', 'value'],
    },
    {
      name: 'groupedField3',
      label: 'Grouped Field 3',
      comparator: 'groupNumber',
      groupNumber: 'group1',
      valueSources: ['field', 'value'],
    },
    {
      name: 'groupedField4',
      label: 'Grouped Field 4',
      comparator: 'groupNumber',
      groupNumber: 'group1',
      valueSources: ['field', 'value'],
    },
  ]
).map((o) => toFullOption(o));

const initialQuery = { combinator: 'and', rules: [] };

function CustomTabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`keep-mounted-tabpanel-${index}`}
      aria-labelledby={`keep-mounted-tab-${index}`}
      {...other}
    >
      <Box sx={{ p: 1 }}>{children}</Box>
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `keep-mounted-tab-${index}`,
    'aria-controls': `keep-mounted-tabpanel-${index}`,
  };
}

export default function Report({ formTitle, reportName }) {

  const [query, setQuery] = useState(initialQuery);
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant='h8' component='div'>
        {formTitle}
      </Typography>
      <Tabs
        value={value}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="tabs"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="استعلام 1" {...a11yProps(0)} />
        <Tab label="استعلام 2" {...a11yProps(1)} />
        <Tab label="ترتيب حسب" {...a11yProps(1)} />
        <Tab label="النتيجة" {...a11yProps(1)} />
      </Tabs>
      <CustomTabPanel value={value} index={0}>

      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <QueryBuilder
          fields={fields}
          query={query}
          onQueryChange={setQuery}
          validator={defaultValidator}
        />
      </CustomTabPanel>
    </Box>
  )
};