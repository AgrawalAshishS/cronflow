//! Node-Cronflow Core Engine
//! 
//! This is the Rust core engine that handles state management, job execution,
//! and communication with the Node.js SDK via N-API.

pub mod error;
pub mod models;
pub mod database;
pub mod state;
pub mod bridge;

/// Core engine version
pub const VERSION: &str = "0.1.0";

/// Initialize the core engine
pub fn init() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();
    
    log::info!("Node-Cronflow Core Engine v{} initialized", VERSION);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::models::{WorkflowDefinition, StepDefinition, TriggerDefinition, RetryConfig, WorkflowRun, RunStatus, StepResult, StepStatus};
    use std::fs;
    use chrono::Utc;
    use uuid::Uuid;
    use serde_json;

    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }

    #[test]
    fn test_init() {
        assert!(init().is_ok());
    }

    #[test]
    fn test_database_schema_initialization() {
        // Create a temporary database file
        let db_path = "test_schema.db";
        
        // Clean up any existing test file
        let _ = fs::remove_file(db_path);
        
        // Test database initialization
        let db_result = Database::new(db_path);
        assert!(db_result.is_ok(), "Database initialization should succeed");
        
        let db = db_result.unwrap();
        
        // Test that we can get database stats (this verifies schema is working)
        let stats_result = db.get_stats();
        assert!(stats_result.is_ok(), "Database stats should be retrievable");
        
        let stats = stats_result.unwrap();
        assert_eq!(stats["workflows"], 0, "Should have 0 workflows initially");
        assert_eq!(stats["total_runs"], 0, "Should have 0 runs initially");
        assert_eq!(stats["active_runs"], 0, "Should have 0 active runs initially");
        
        // Clean up
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn test_workflow_definition_serialization() {
        let now = Utc::now();
        
        let workflow = WorkflowDefinition {
            id: "test-workflow".to_string(),
            name: "Test Workflow".to_string(),
            description: Some("A test workflow".to_string()),
            steps: vec![
                StepDefinition {
                    id: "step1".to_string(),
                    name: "First Step".to_string(),
                    action: "test_action".to_string(),
                    timeout: Some(5000),
                    retry: Some(RetryConfig {
                        max_attempts: 3,
                        backoff_ms: 1000,
                    }),
                    depends_on: vec![],
                }
            ],
            triggers: vec![
                TriggerDefinition::Webhook {
                    path: "/webhook/test".to_string(),
                    method: "POST".to_string(),
                }
            ],
            created_at: now,
            updated_at: now,
        };
        
        // Test validation
        assert!(workflow.validate().is_ok(), "Workflow should be valid");
        
        // Test serialization
        let json_result = serde_json::to_string(&workflow);
        assert!(json_result.is_ok(), "Workflow should serialize to JSON");
        
        let json = json_result.unwrap();
        assert!(json.contains("test-workflow"), "JSON should contain workflow ID");
        assert!(json.contains("Test Workflow"), "JSON should contain workflow name");
        
        // Test deserialization
        let deserialized_result = serde_json::from_str::<WorkflowDefinition>(&json);
        assert!(deserialized_result.is_ok(), "Workflow should deserialize from JSON");
        
        let deserialized = deserialized_result.unwrap();
        assert_eq!(deserialized.id, workflow.id, "Deserialized workflow should have same ID");
        assert_eq!(deserialized.name, workflow.name, "Deserialized workflow should have same name");
        assert_eq!(deserialized.steps.len(), workflow.steps.len(), "Deserialized workflow should have same number of steps");
    }

    #[test]
    fn test_workflow_run_serialization() {
        let now = Utc::now();
        let run_id = Uuid::new_v4();
        
        let run = WorkflowRun {
            id: run_id,
            workflow_id: "test-workflow".to_string(),
            status: RunStatus::Pending,
            payload: serde_json::json!({"test": "data"}),
            started_at: now,
            completed_at: None,
            error: None,
        };
        
        // Test validation
        assert!(run.validate().is_ok(), "Workflow run should be valid");
        
        // Test serialization
        let json_result = serde_json::to_string(&run);
        assert!(json_result.is_ok(), "Workflow run should serialize to JSON");
        
        let json = json_result.unwrap();
        assert!(json.contains(&run_id.to_string()), "JSON should contain run ID");
        assert!(json.contains("test-workflow"), "JSON should contain workflow ID");
        
        // Test deserialization
        let deserialized_result = serde_json::from_str::<WorkflowRun>(&json);
        assert!(deserialized_result.is_ok(), "Workflow run should deserialize from JSON");
        
        let deserialized = deserialized_result.unwrap();
        assert_eq!(deserialized.id, run.id, "Deserialized run should have same ID");
        assert_eq!(deserialized.workflow_id, run.workflow_id, "Deserialized run should have same workflow ID");
        assert!(matches!(deserialized.status, RunStatus::Pending), "Deserialized run should have same status");
    }

    #[test]
    fn test_step_result_serialization() {
        let now = Utc::now();
        
        let step_result = StepResult {
            step_id: "step1".to_string(),
            status: StepStatus::Completed,
            output: Some(serde_json::json!({"result": "success"})),
            error: None,
            started_at: now,
            completed_at: Some(now),
            duration_ms: Some(1000),
        };
        
        // Test validation
        assert!(step_result.validate().is_ok(), "Step result should be valid");
        
        // Test serialization
        let json_result = serde_json::to_string(&step_result);
        assert!(json_result.is_ok(), "Step result should serialize to JSON");
        
        let json = json_result.unwrap();
        assert!(json.contains("step1"), "JSON should contain step ID");
        assert!(json.contains("success"), "JSON should contain output data");
        
        // Test deserialization
        let deserialized_result = serde_json::from_str::<StepResult>(&json);
        assert!(deserialized_result.is_ok(), "Step result should deserialize from JSON");
        
        let deserialized = deserialized_result.unwrap();
        assert_eq!(deserialized.step_id, step_result.step_id, "Deserialized step result should have same step ID");
        assert!(matches!(deserialized.status, StepStatus::Completed), "Deserialized step result should have same status");
    }

    #[test]
    fn test_validation_errors() {
        // Test invalid workflow definition
        let invalid_workflow = WorkflowDefinition {
            id: "".to_string(), // Empty ID
            name: "Test".to_string(),
            description: None,
            steps: vec![], // No steps
            triggers: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        
        let validation_result = invalid_workflow.validate();
        assert!(validation_result.is_err(), "Invalid workflow should fail validation");
        
        // Test invalid step definition
        let invalid_step = StepDefinition {
            id: "".to_string(), // Empty ID
            name: "Test Step".to_string(),
            action: "test_action".to_string(),
            timeout: None,
            retry: None,
            depends_on: vec![],
        };
        
        let step_validation_result = invalid_step.validate();
        assert!(step_validation_result.is_err(), "Invalid step should fail validation");
    }

    #[test]
    fn test_state_manager_workflow_registration() {
        // Create a temporary database file
        let db_path = "test_state_manager.db";
        
        // Clean up any existing test file
        let _ = fs::remove_file(db_path);
        
        // Create state manager
        let state_manager_result = crate::state::StateManager::new(db_path);
        assert!(state_manager_result.is_ok(), "State manager should be created successfully");
        
        let state_manager = state_manager_result.unwrap();
        
        // Create a test workflow
        let workflow = WorkflowDefinition {
            id: "test-workflow".to_string(),
            name: "Test Workflow".to_string(),
            description: Some("A test workflow".to_string()),
            steps: vec![
                StepDefinition {
                    id: "step1".to_string(),
                    name: "First Step".to_string(),
                    action: "test_action".to_string(),
                    timeout: Some(5000),
                    retry: Some(RetryConfig {
                        max_attempts: 3,
                        backoff_ms: 1000,
                    }),
                    depends_on: vec![],
                }
            ],
            triggers: vec![
                TriggerDefinition::Webhook {
                    path: "/webhook/test".to_string(),
                    method: "POST".to_string(),
                }
            ],
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        
        // Test workflow registration
        let register_result = state_manager.register_workflow(workflow.clone());
        assert!(register_result.is_ok(), "Workflow registration should succeed");
        
        // Test workflow retrieval
        let retrieved_workflow_result = state_manager.get_workflow("test-workflow");
        assert!(retrieved_workflow_result.is_ok(), "Workflow retrieval should succeed");
        
        let retrieved_workflow = retrieved_workflow_result.unwrap();
        assert!(retrieved_workflow.is_some(), "Retrieved workflow should exist");
        
        let retrieved = retrieved_workflow.unwrap();
        assert_eq!(retrieved.id, workflow.id, "Retrieved workflow should have same ID");
        assert_eq!(retrieved.name, workflow.name, "Retrieved workflow should have same name");
        assert_eq!(retrieved.steps.len(), workflow.steps.len(), "Retrieved workflow should have same number of steps");
        
        // Test creating a workflow run
        let mut state_manager = crate::state::StateManager::new(db_path).unwrap();
        let run_result = state_manager.create_run("test-workflow", serde_json::json!({"test": "data"}));
        assert!(run_result.is_ok(), "Workflow run creation should succeed");
        
        let run_id = run_result.unwrap();
        assert!(run_id != Uuid::nil(), "Run ID should not be nil");
        
        // Test retrieving the run
        let run_retrieval_result = state_manager.get_run(&run_id);
        assert!(run_retrieval_result.is_ok(), "Run retrieval should succeed");
        
        let retrieved_run = run_retrieval_result.unwrap();
        assert!(retrieved_run.is_some(), "Retrieved run should exist");
        
        let run = retrieved_run.unwrap();
        assert_eq!(run.workflow_id, "test-workflow", "Run should have correct workflow ID");
        assert!(matches!(run.status, RunStatus::Pending), "Run should have pending status");
        
        // Clean up
        let _ = fs::remove_file(db_path);
    }
}
