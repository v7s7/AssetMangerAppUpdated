import React from 'react';
import { groups } from '../data/groups';

export default function FiltersBar({ searchText, setSearchText, filterGroup, setFilterGroup }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <input
        type="text"
        placeholder="Search by Asset ID, Serial Number, Brand..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginRight: '10px', padding: '6px', width: '300px' }}
      />

      <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
        <option value="">All Groups</option>
        {groups.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
    </div>
  );
}
