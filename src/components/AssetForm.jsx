import React, { useState, useEffect } from 'react';
import {
  addAsset,
  updateAsset,
  getNextAssetId
} from '../utils/api';
import { groups } from '../data/groups';
import { categories } from '../data/categories';

export default function AssetForm({ onSave, editData }) {
  const isEdit = !!editData;
  const [formData, setFormData] = useState(null);
  const [originalId, setOriginalId] = useState(null);
const STATUS_OPTIONS = ['Active', 'Not active', 'Retired', 'Suspended'];

  // extra fields for "Other"
  const [otherGroup, setOtherGroup] = useState('');
  const [otherAssetType, setOtherAssetType] = useState('');

  // Required core fields
  const requiredFields = ['assetId', 'group', 'assetType'];

  useEffect(() => {
    if (isEdit) {
      setFormData(editData);
      setOriginalId(editData.assetId);
      // If editing and the current values are not in the predefined lists, show them as "Other"
      if (editData?.group && !groups.includes(editData.group)) {
        setOtherGroup(editData.group);
        setFormData((prev) => ({ ...prev, group: 'Other' }));
      }
      if (editData?.assetType && !categories.includes(editData.assetType)) {
        setOtherAssetType(editData.assetType);
        setFormData((prev) => ({ ...prev, assetType: 'Other' }));
      }
    } else {
      const init = async () => {
        setFormData({
          assetId: '',
          group: '',
          assetType: '',
          brandModel: '',
          serialNumber: '',
          assignedTo: '',
          ipAddress: '',
          macAddress: '',
          osFirmware: '',
          cpu: '',
          ram: '',
          storage: '',
          portDetails: '',
          powerConsumption: '',
          purchaseDate: '',
          warrantyExpiry: '',
          eol: '',
          maintenanceExpiry: '',
          cost: '',
          depreciation: '',
          residualValue: '',
          status: '',
          condition: '',
          usagePurpose: '',
          accessLevel: '',
          licenseKey: '',
          complianceStatus: '',
          documentation: '',
          remarks: '',
          lastAuditDate: '',
          disposedDate: '',
          replacementPlan: ''
        });
      };
      init();
    }
  }, [editData, isEdit]);

  const handleChange = async (e) => {
    const { name, value } = e.target;

    // Special handling for selects
    if (name === 'group') {
      setFormData((prev) => ({ ...prev, group: value }));
      return;
    }

    if (name === 'assetType') {
      if (value === 'Other') {
        // Wait for user to type custom asset type; clear assetId until then
        setFormData((prev) => ({ ...prev, assetType: value, assetId: '' }));
      } else {
        try {
          const newId = await getNextAssetId(value);
          setFormData((prev) => ({
            ...prev,
            assetType: value,
            assetId: newId
          }));
        } catch (err) {
          alert('Failed to generate asset ID: ' + err.message);
        }
      }
      return;
    }

    // Regular fields
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle "Other" text inputs
  const handleOtherGroupChange = (e) => {
    setOtherGroup(e.target.value);
  };

  const handleOtherAssetTypeChange = async (e) => {
    const val = e.target.value;
    setOtherAssetType(val);

    // Generate ID dynamically from custom asset type when user types it
    if (val && val.trim().length >= 2) {
      try {
        const newId = await getNextAssetId(val.trim());
        setFormData((prev) => ({ ...prev, assetId: newId }));
      } catch (err) {
        // keep silent; user might still be typing
      }
    } else {
      // Too short; clear the ID
      setFormData((prev) => ({ ...prev, assetId: '' }));
    }
  };

  const sections = [
    {
      title: 'Basic Info',
      fields: ['assetId', 'group', 'assetType', 'brandModel', 'serialNumber', 'assignedTo']
    },
    {
      title: 'Technical Details',
      fields: ['ipAddress', 'macAddress', 'osFirmware', 'cpu', 'ram', 'storage', 'portDetails', 'powerConsumption']
    },
    {
      title: 'Lifecycle Info',
      fields: ['purchaseDate', 'warrantyExpiry', 'eol', 'maintenanceExpiry']
    },
    {
      title: 'Financial Info',
      fields: ['cost', 'depreciation', 'residualValue']
    },
    {
      title: 'Status & Usage',
      fields: ['status', 'condition', 'usagePurpose', 'accessLevel']
    },
    {
      title: 'Compliance & Documentation',
      fields: ['licenseKey', 'complianceStatus', 'documentation']
    },
    {
      title: 'Additional Info',
      fields: ['remarks', 'lastAuditDate', 'disposedDate', 'replacementPlan']
    }
  ];

  const numericFields = ['ram', 'storage', 'powerConsumption', 'cost', 'depreciation', 'residualValue'];

  const humanize = (field) =>
    field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData) return;

    // Dynamic required rules
    const missing = [];

    // base required
    requiredFields.forEach((f) => {
      if (!formData[f] || String(formData[f]).trim() === '') {
        missing.push(f);
      }
    });

    // when "Other" is selected, require the custom text
    if (formData.group === 'Other' && (!otherGroup || !otherGroup.trim())) {
      missing.push('otherGroup');
    }
    if (formData.assetType === 'Other' && (!otherAssetType || !otherAssetType.trim())) {
      missing.push('otherAssetType');
    }

    if (missing.length) {
      alert(`Please fill required fields: ${missing.map(humanize).join(', ')}`);
      return;
    }

    // Normalize payload: replace "Other" with the typed values
    const payload = {
      ...formData,
      group: formData.group === 'Other' ? otherGroup.trim() : formData.group,
      assetType: formData.assetType === 'Other' ? otherAssetType.trim() : formData.assetType
    };

    try {
      if (isEdit) {
        await updateAsset(payload, originalId || formData.assetId);
        alert('Asset updated');
      } else {
        await addAsset(payload);
        alert('Asset added');
      }
      if (onSave) onSave();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (!formData) return <p>Loading form...</p>;

  const isAssetIdReadOnly = !isEdit; // ID is auto-generated in add mode
  const mustHaveGroupText = formData.group === 'Other';
  const mustHaveTypeText = formData.assetType === 'Other';

  const isSubmitDisabled =
    !formData.group ||
    !formData.assetType ||
    !formData.assetId ||
    (mustHaveGroupText && !otherGroup.trim()) ||
    (mustHaveTypeText && !otherAssetType.trim());

  return (
    <form onSubmit={handleSubmit} style={formContainer}>
      <h2 style={formHeader}>{isEdit ? 'Edit Asset' : 'Add New Asset'}</h2>

      {sections.map((section) => (
        <fieldset key={section.title} style={fieldsetStyle}>
          <legend style={legendStyle}>{section.title}</legend>
          {section.fields.map((field) => {
            const isDate = field.toLowerCase().includes('date');
            const isTextArea = ['remarks', 'documentation'].includes(field);
            const isGroup = field === 'group';
            const isStatus = field === 'status';

            const isAssetType = field === 'assetType';
            const isAssetId = field === 'assetId';
            const isNumeric = numericFields.includes(field);
            const isRequired =
              ['assetId', 'group', 'assetType'].includes(field) ||
              (field === 'group' && mustHaveGroupText) ||
              (field === 'assetType' && mustHaveTypeText);

            const label = humanize(field);

            return (
              <div key={field} style={fieldRow}>
                <label style={labelStyle}>
                  {label}{['assetId', 'group', 'assetType'].includes(field) ? ' *' : ''}:
                </label>

                {isGroup ? (
                  <>
                    <select
                      name="group"
                      value={formData.group}
                      onChange={handleChange}
                      style={inputStyle}
                      required
                    >
                      <option value="">Select</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                    {mustHaveGroupText && (
                      <input
                        type="text"
                        value={otherGroup}
                        onChange={handleOtherGroupChange}
                        placeholder="Enter custom group"
                        style={{ ...inputStyle, marginTop: 6 }}
                        required
                      />
                    )}
                  </>
                ) : isAssetType ? (
                  <>
                    <select
                      name="assetType"
                      value={formData.assetType}
                      onChange={handleChange}
                      style={inputStyle}
                      required
                    >
                      <option value="">Select</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                    {mustHaveTypeText && (
                      <input
                        type="text"
                        value={otherAssetType}
                        onChange={handleOtherAssetTypeChange}
                        placeholder="Enter custom asset type"
                        style={{ ...inputStyle, marginTop: 6 }}
                        required
                      />
                    )}
                  </>
                ) : isTextArea ? (
                  <textarea
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    rows="3"
                    style={inputStyle}
                  />
                ) : isAssetId ? (
                  // Read-only visual with gray bg; store value as read-only input
                  <input
                    type="text"
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      backgroundColor: isAssetIdReadOnly ? '#f0f0f0' : '#fff',
                      color: isAssetIdReadOnly ? '#555' : '#000'
                    }}
                    readOnly={isAssetIdReadOnly}
                    required
                    placeholder={
                      !formData.assetId
                        ? (formData.assetType === 'Other'
                            ? 'Type custom asset type to generate ID'
                            : 'Select Asset Type to generate ID')
                        : undefined
                    }
                  />
                  ) : isStatus ? (
  <select
    name="status"
    value={formData.status || ''}
    onChange={handleChange}
    style={inputStyle}
  >
    <option value="">Select</option>
    {STATUS_OPTIONS.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>

                ) : (
                  <input
                    type={isDate ? 'date' : isNumeric ? 'number' : 'text'}
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                  
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <div style={{ textAlign: 'center' }}>
        <button
          type="submit"
          style={{ ...submitButtonStyle, opacity: isSubmitDisabled ? 0.7 : 1 }}
          disabled={isSubmitDisabled}
        >
          {isEdit ? 'Update Asset' : 'Save Asset'}
        </button>
      </div>
    </form>
  );
}

// === Styles ===
const formContainer = {
  maxWidth: '900px',
  margin: '0 auto',
  background: '#fff',
  padding: '25px',
  borderRadius: '10px',
  boxShadow: '0 0 10px rgba(0,0,0,0.08)'
};

const formHeader = {
  textAlign: 'center',
  marginBottom: '30px',
  fontSize: '24px',
  color: '#333'
};

const fieldsetStyle = {
  marginBottom: '25px',
  padding: '15px',
  border: '1px solid #ccc',
  borderRadius: '6px'
};

const legendStyle = {
  fontWeight: 'bold',
  fontSize: '16px',
  padding: '0 10px'
};

const fieldRow = {
  display: 'flex',
  flexDirection: 'column',
  marginBottom: '12px'
};

const labelStyle = {
  marginBottom: '4px',
  fontWeight: '500'
};

const inputStyle = {
  padding: '8px',
  fontSize: '14px',
  borderRadius: '4px',
  border: '1px solid #ccc'
};

const submitButtonStyle = {
  marginTop: '20px',
  padding: '10px 20px',
  fontSize: '16px',
  background: '#28a745',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer'
};
