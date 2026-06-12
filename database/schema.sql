-- Vignan's Institute of Information Technology (VIIT)
-- Enterprise Asset Management System (AMS)
-- Relational Database Schema (PostgreSQL DDL)

-- Create Custom ENUM Types for strict domain constraints
CREATE TYPE user_role AS ENUM (
    'super_admin', 
    'asset_manager', 
    'employee', 
    'auditor', 
    'maintenance_team'
);

CREATE TYPE asset_status AS ENUM (
    'available', 
    'allocated', 
    'maintenance', 
    'disposed'
);

CREATE TYPE request_status AS ENUM (
    'pending', 
    'approved', 
    'rejected'
);

CREATE TYPE repair_status AS ENUM (
    'reported', 
    'in_progress', 
    'resolved', 
    'unrepairable'
);

-- 1. Users Table (Authentication and Identity)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Assets Table (Inventory and Status tracking)
CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    asset_tag VARCHAR(50) UNIQUE NOT NULL, -- e.g. VIIT-IT-2026-003
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g. Electronics, Furniture, Lab Equipment
    status asset_status NOT NULL DEFAULT 'available',
    purchase_date DATE,
    cost DECIMAL(12, 2),
    serial_number VARCHAR(100),
    location VARCHAR(100), -- campus buildings/labs e.g. "Main Block, Lab 3"
    qr_code VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Requests Table (Asset Allocation Requests)
CREATE TABLE requests (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Approving manager ID
    purpose TEXT NOT NULL,
    status request_status NOT NULL DEFAULT 'pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action_date TIMESTAMP WITH TIME ZONE,
    comments TEXT
);

-- 4. Maintenance Logs Table (Engineering and repair track)
CREATE TABLE maintenance_logs (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Maintenance Team user
    issue_description TEXT NOT NULL,
    repair_status repair_status NOT NULL DEFAULT 'reported',
    cost DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Audit logs for system compliance (Read-only tracking for Auditors)
CREATE TABLE system_audits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- e.g., "USER_LOGIN", "ASSET_CREATED", "STATUS_CHANGED"
    entity_table VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    previous_state JSONB,
    new_state JSONB,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Default Admin Credentials for testing (Password: password123)
-- Hash generated for password 'password123' using standard bcrypt is:
-- $2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm
INSERT INTO users (name, email, password_hash, role, department) VALUES
('VIIT Admin', 'admin@vignaniit.edu.in', '$2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm', 'super_admin', 'System Cell');

-- Seed Additional Roles for testing (Standard password: password123)
-- Hash generated for password 'password123' using standard bcrypt is:
-- $2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm
INSERT INTO users (name, email, password_hash, role, department) VALUES
('Asset Manager Vignan', 'manager@viit.edu.in', '$2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm', 'asset_manager', 'Administration'),
('Employee Prasad', 'employee@viit.edu.in', '$2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm', 'employee', 'Computer Science'),
('Auditor Varma', 'auditor@viit.edu.in', '$2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm', 'auditor', 'Internal Quality Assurance Cell'),
('Maintenance Tech Satish', 'tech@viit.edu.in', '$2a$10$C82K6N8z5YF2vN.5vW4vLeUj3hDymhI2YFf0dYsc9pIq.f9uF/vYm', 'maintenance_team', 'Estate Office');
